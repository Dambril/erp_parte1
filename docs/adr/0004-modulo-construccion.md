# ADR 0004: Módulo de construcción

## Estado

Aceptada (Bloque 2: módulo de construcción y vistas por rol). Sustituye los puntos de ADR 0001 sobre el módulo `obras`,
su bitácora `audit_log`, los permisos por acción aplicados a obras y la sincronización de obras por WebSocket.

## Contexto

El módulo `obras` anterior guardaba el presupuesto (`total`, `ejercido`) dentro de la obra, trataba la propuesta como
una etapa de la misma entidad y decidía los permisos por acción genérica. El Bloque 2 pide presupuesto derivado de
movimientos inmutables, propuestas separadas de las obras y que la API oculte los montos a quien no puede verlos.

## Decisión

### Se retira `obras`

Se eliminan `modules/obras`, `packages/domain/src/obras.ts`, `ObrasStore`, `seed-demo.ts` y sus pruebas. Lo sustituye
`modules/construction`, dividido en `proposals`, `projects`, `budget` y `certifications` (route → controller → service →
repository), más el dashboard. Las colecciones `obras` y `audit_log` de MongoDB no se tocan ni se migran: quedan sin uso.
Se pierden, hasta que un bloque posterior las pida, las mediciones de impacto y la acción "solicitar cambios".

La web (React + Vite) conserva solo el acceso; las pantallas de construcción están en la app móvil.

### Permisos `modulo.recurso:accion`

`ROLE_PERMISSIONS` (en `packages/domain`) es un mapa explícito de rol a permisos para `construction.*` e `identity.*`.
Hay dos perfiles: `admin` (lo hereda `superadmin`) y `user` (lo heredan `manager` y `viewer`). `RoleSchema` no cambia.
Catálogos, inventario y usuarios siguen con `PERMISSION_CATALOG` y `ROLE_ACTIONS`. `requirePermission` acepta las dos
formas y `GET /me` entrega ambas listas juntas.

### Montos según permiso

Sin `construction.budget:read_amounts` ninguna respuesta incluye montos. El `service` arma un tipo distinto en cada caso
(`ProjectDetail` / `ProjectDetailWithAmounts`, `ProposalDetail` / `ProposalDetailWithAmounts`, `BudgetSummary` /
`BudgetSummaryWithAmounts`); el cliente pinta montos solo si llegaron (`budgetHasAmounts`, `proposalHasAmounts`).
Consecuencias:

- Los `summary` de la bitácora nunca llevan montos, porque `GET .../activity` solo exige `projects:read`.
- El canal de tiempo real difunde un aviso sin datos (`{ type: 'construction.changed', entity, id }`) y cada cliente
  vuelve a consultar la API con sus propios permisos.
- Las pruebas revisan el JSON real (claves y valores con forma de monto), no los tipos.

### Presupuesto derivado de movimientos

- La obra no guarda montos. `budgetMovements` es inmutable: sin `updatedAt` ni `deletedAt`, y su repository solo inserta,
  lista y agrega.
- `initial_budget` y `expense` se guardan en positivo; `adjustment`, con signo.
- `currentBudget`, `spent`, `available` y `spentPct` salen de agregaciones de MongoDB sobre `Decimal128`. `spentPct` se
  redondea en el servidor y sale como entero; ningún monto pasa por `number`.
- Corrección: otro `adjustment` con el monto exactamente contrario y `reversesMovementId`. Solo se corrigen ajustes de la
  misma obra, y solo una vez: lo comprueba el servicio y lo garantiza un índice único parcial
  `{ tenantId, reversesMovementId }` (409 `ALREADY_REVERSED`).
- En este bloque los gastos (`expense`) solo los crea el seed.

### Folios

Colección `counters` (`core/counters.ts`) con `findOneAndUpdate` + `$inc` + `upsert` e índice único `{ tenantId, series }`.
No se reutiliza `folio_counters` de inventario porque allí ya existe la serie `MOV` y los folios se mezclarían. El folio se
toma dentro de la transacción del documento que lo usa: si esta aborta, el incremento se revierte y no quedan huecos.
Series: `PRO`, `OBR` y `MOV`, con seis dígitos (`OBR-000001`).

### Transacciones

- **Aprobar una propuesta**: una sola transacción con reintento cambia la propuesta (con `status: in_review` en el
  filtro), toma el folio `OBR`, crea la obra en `planning`, toma el folio `MOV`, crea el `initial_budget` y escribe la
  bitácora. Si la propuesta ya no está en revisión: 409 `INVALID_TRANSITION`.
- **Registrar un ajuste** y **eliminar una obra** empiezan por `ProjectsRepository.touch`, que escribe en la obra dentro
  de la transacción. Sirve de candado: un ajuste y un borrado simultáneos chocan (WriteConflict) y el que se reintenta
  ve el resultado del otro, así no se puede eliminar una obra a la que se le acaba de registrar un movimiento.

### Bitácora

Colección nueva `auditLog` (`tenantId`, `actorId`, `action`, `entityType`, `entityId`, `summary`, `at`); su repository
solo inserta y consulta. `audit_logs` sigue para catálogos, inventario e identidad. Los movimientos de presupuesto y los
requisitos de certificación se registran con `entityType: 'project'` para que aparezcan en la actividad de la obra.

### Reglas de la obra

- Ciclo `planning` → `in_progress` → `certifying` → `completed`, validado en el `service` y con el estado en el filtro
  de la escritura.
- `delayDays`: días desde el `plannedEnd` de la fase en curso, que es la primera fase `in_progress`. Sin fase en curso, 0.
  Las fechas planeadas son `AAAA-MM-DD` y "hoy" se toma en UTC.
- Archivar (`archivedAt`) saca la obra de listados activos y KPIs. Eliminar (`deletedAt`, `deletedBy`) solo si el
  presupuesto no tiene más que el movimiento inicial (409 `PROJECT_HAS_MOVEMENTS`); un ajuste ya corregido también cuenta.
- Al aprobarse, la obra nace sin fases (la propuesta no trae cronograma) y con los requisitos de la plantilla de su
  certificación (`CERTIFICATION_REQUIREMENT_TEMPLATES`): EDGE, energía, agua y materiales; LEED, sus seis categorías de
  créditos; `none`, ninguno.
- "Requiere tu atención": la API incluye cada grupo solo si el usuario tiene el permiso para actuar sobre él
  (`proposals:approve`, `projects:update`, `budget:read_amounts`, `certifications:update`). Sin ninguno, `attention` no
  aparece en la respuesta.

## Pendiente

- Restaurar desde la Papelera: el permiso `construction.projects:restore` existe, pero aún no hay ruta.
- Crear, editar y enviar propuestas (Bloque 3) y registrar gastos por API.
- Evidencias de certificación (archivos).
- Pantallas de construcción en la web.
- Empaquetar las fuentes Space Grotesk e Inter en la app; los tokens ya las nombran y se usa la fuente del sistema.
