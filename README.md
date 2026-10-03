# T-Ssera Construcciones · ERP de obras

ERP multi-empresa para constructoras con enfoque ecológico: propuestas, avance físico, presupuesto ejercido, certificaciones ambientales (LEED, EDGE) e impacto (CO₂, energía, agua) de todas las obras en un panel. Incluye API (Express + MongoDB Atlas), app Android (React Native) y web (React + Vite; por ahora solo el acceso).

## Estructura del repositorio

Monorepo con workspaces de pnpm.

| Carpeta | Contenido |
| --- | --- |
| `apps/api` | API REST + canal WebSocket (Node.js + Express). Módulos `identity`, `catalogs`, `inventory` y `construction` en `src/modules`. |
| `apps/mobile` | App Android (React Native 0.73). Proyecto nativo en `apps/mobile/android`. |
| `apps/web` | Panel web (React + Vite), publicado en Cloudflare Pages. |
| `packages/domain` | Esquemas (Zod), tipos y reglas de negocio compartidas: estados, transiciones, permisos por rol, dinero. |
| `packages/api-client` | Cliente HTTP con sesión y renovación de tokens y canal en tiempo real, compartido por app y web. |
| `packages/ui` | Tokens del sistema visual (colores, tipografías, radios) y componentes de React Native compartidos. |
| `packages/config` | Carga y validación (Zod) de las variables de entorno. |
| `infra` | `Dockerfile` de la API, `docker-compose.yml` (API + Redis) y el Worker de Cloudflare que mantiene despierta la API. |
| `docs/adr` | Decisiones de arquitectura. |

## Requisitos

- Node.js 20 o superior
- pnpm 9
- Una URI de MongoDB Atlas con transacciones habilitadas
- Docker (opcional, para Redis y la API en contenedor)
- Para la app móvil: Android Studio, JDK 17 y un dispositivo virtual (ver [Ejecutar la app móvil](#ejecutar-la-app-móvil))

## Configuración inicial

```powershell
corepack enable
corepack prepare pnpm@9 --activate
pnpm install
Copy-Item .env.example .env.local
```

Edita `.env.local` con una URI real de MongoDB Atlas y secretos locales. Los archivos `.env*` con valores reales no deben entrar al repositorio.

Variables (validadas al arrancar en `packages/config`):

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `MONGODB_URI` | Sí | URI `mongodb+srv://...` de Atlas. |
| `MONGODB_DB_NAME` | No | Nombre de la base; si falta, se usa el de la URI (o `test`). |
| `JWT_SECRET` | Sí | Mínimo 8 caracteres. Usa un valor largo y aleatorio en producción. |
| `JWT_EXPIRES_IN` | No | Vida del access token. Por defecto `15m`. El refresh token dura 30 días. |
| `DEFAULT_TENANT_ID` | Sí | Tenant por defecto en desarrollo. |
| `PORT` | No | Por defecto `3000`. |
| `REDIS_URL` | No | Solo hará falta cuando existan jobs con BullMQ. |
| `RESEND_API_KEY` | No | API key de Resend. Sin ella los correos no se envían (solo log). |
| `EMAIL_FROM` | No | Remitente. Por defecto `ERP <onboarding@resend.dev>`, que solo entrega al correo dueño de la cuenta de Resend. |
| `APP_WEB_URL` | En producción | URL pública de la web; los correos enlazan a `/restablecer?token=...` y `/activar?token=...`. Fuera de producción, `http://localhost:5173`. |
| `SEED_*` | Solo para `seed` | Empresa y cuentas iniciales (ver más abajo). |
| `CORS_ORIGINS` | No | Orígenes web permitidos, separados por comas. Si falta: cualquiera en desarrollo, ninguno en producción. Las apps nativas no lo necesitan. |
| `NODE_ENV` | No | `development`, `test` o `production`. |

## Verificar el proyecto

```powershell
pnpm lint
pnpm build
pnpm test
```

## Ejecutar la API

```powershell
pnpm dev
```

`GET http://localhost:3000/health` responde el estado de la API y de MongoDB. Devuelve `503` si la conexión con la base no está activa.

### Autenticación

Todas las rutas salvo `/health` y las públicas de `/auth/*` exigen `Authorization: Bearer <accessToken>`. El tenant se toma del token. Además, en cada petición se comprueba que la sesión del token siga abierta y la cuenta activa, y el rol se toma de la base: cerrar sesión, desactivar una cuenta o cambiarle el rol aplica de inmediato. Detalle de sesiones, bloqueo y consultas sin tenant en [ADR 0003](docs/adr/0003-acceso-y-consultas-sin-tenant.md) y [ADR 0005](docs/adr/0005-propuestas-usuarios-y-papelera.md).

| Ruta | Descripción |
| --- | --- |
| `POST /auth/login` | `{ email, password }` → `accessToken` (15 min), `refreshToken` (30 días) y el usuario. 401 `INVALID_CREDENTIALS` igual para correo inexistente, contraseña incorrecta o cuenta no activa. Tras 5 fallos seguidos, 429 `TOO_MANY_ATTEMPTS` durante 5 minutos. Además, máximo 10 intentos por IP cada 15 minutos. |
| `POST /auth/refresh` | `{ refreshToken }` → par de tokens nuevo. El anterior queda revocado; reutilizarlo cierra todas las sesiones. |
| `POST /auth/logout` | Autenticada. Revoca la sesión del access token. 204. |
| `POST /auth/password/forgot` | `{ email }` → 202 siempre con el mismo cuerpo; si la cuenta está activa envía el enlace (vence en 60 min). |
| `POST /auth/password/reset` | `{ token, password }` → 204. Token de un solo uso; cierra todas las sesiones del usuario. No inicia sesión. 400 `INVALID_TOKEN` si no sirve. |
| `POST /auth/invitations/accept` | `{ token, password }` → 204 y la cuenta queda activa. |
| `GET /me` | Usuario, empresa (`company`), rol y lista de permisos (`permissions`). |
| `PATCH /me` | `identity.profile:update`. `{ name }` → el usuario actualizado. |
| `POST /me/password` | `identity.profile:update`. `{ currentPassword, newPassword }` → 204. 400 `INVALID_CURRENT_PASSWORD` si la actual no coincide. Cierra las demás sesiones; la actual sigue abierta. |

### Usuarios

Todas exigen `identity.users:manage`. Las cuentas se dan de alta por invitación y no se eliminan: se desactivan.

| Ruta | Descripción |
| --- | --- |
| `GET /users` | Paginado. Filtros `q` (nombre o correo) y `status` (`active`, `invited`, `deactivated`). |
| `POST /users/invitations` | `{ email, name, role }` con `role` `admin` o `user`. Crea la cuenta en `invited` y envía el enlace `${APP_WEB_URL}/activar?token=...` (vence en 7 días). Responde `{ user, emailSent }`; con `emailSent: false` la cuenta quedó creada y se puede reenviar. 409 `EMAIL_IN_USE` si el correo ya existe. |
| `POST /users/:id/invitations/resend` | Enlace nuevo; el anterior deja de servir. 409 `INVALID_TRANSITION` si la invitación ya no está pendiente. |
| `PATCH /users/:id/role` | `{ role }`. 409 `LAST_ADMIN` si es el último administrador activo. |
| `POST /users/:id/deactivate` | Desactiva y cierra todas sus sesiones. 409 `LAST_ADMIN` igual que arriba. |
| `POST /users/:id/reactivate` | Vuelve a `active` (o a `invited` si nunca aceptó la invitación). |

La empresa y las primeras cuentas (un `admin` y un `user`) se crean con el seed, que toma todo de las variables `SEED_*` de `.env.local` (ver `.env.example`; las contraseñas, de 15 a 128 caracteres, nunca van como argumento). Se crean en la base a la que apunte `.env.local` y es idempotente: lo que ya existe no se modifica.

El seed carga además datos de demostración de construcción, a nombre del administrador: cinco obras (Torre Cedro retrasada, Plaza Origen con el 96% del presupuesto ejercido, Oficinas Raíz certificando con requisitos pendientes, Residencial Alameda y Casa Manantial) y dos propuestas en revisión, con sus movimientos de presupuesto. Solo lo hace si el tenant no tiene ninguna obra ni propuesta. **Si `.env.local` apunta a producción, esos datos de demostración quedan en producción.**

```powershell
pnpm --filter @erp/api seed
```

### Convenciones de la API

- Las respuestas exitosas tienen la forma `{ success: true, data, timestamp }`. Los listados devuelven en `data` el objeto `{ items, page, pageSize, total }` y aceptan `?page=` (desde 1), `?pageSize=` (máximo 100) y, en catálogos, `?q=` como búsqueda de texto literal.
- Cantidades, costos, precios y tasas viajan como **texto decimal** (`"12.50"`), nunca como número; se guardan como `Decimal128`.
- Cada ruta exige un permiso. En catálogos e inventario es `módulo.acción` (catálogo en `PERMISSION_CATALOG` de `packages/domain`): `viewer` solo lee, `user` lee y crea, `manager` también modifica y `admin` puede todo; algunas rutas son solo para `admin`. En construcción e identidad es `modulo.recurso:accion` (ver [Roles y permisos](#roles-y-permisos)).
- Los errores tienen la forma `{ success: false, error: { code, message, details? }, timestamp, path }`. Los de validación (Zod) llevan `code: "VALIDATION_ERROR"` y el detalle por campo en `details`.

### Catálogos

Recursos: `units`, `taxes`, `currencies`, `product-categories`, `products`, `customers`, `suppliers` y `warehouses`. Cada documento acepta un objeto `custom` para campos configurables.

| Ruta | Permiso | Descripción |
| --- | --- | --- |
| `GET /catalogs/<recurso>` | `catalogs.<entidad>.read` | Listado paginado. En `products` busca por `sku` y `name`; en `customers` y `suppliers`, por `code`, `legalName` y `taxId`. |
| `GET /catalogs/<recurso>/:id` | `catalogs.<entidad>.read` | Un registro activo. |
| `POST /catalogs/<recurso>` | `catalogs.<entidad>.create` | Alta. `409` si el código o SKU ya existe en el tenant. |
| `PATCH /catalogs/<recurso>/:id` | `catalogs.<entidad>.update` | Cambio parcial. En productos no se pueden cambiar `type`, `tracking` ni `unitId`. |
| `DELETE /catalogs/<recurso>/:id` | `catalogs.<entidad>.delete` | Borrado lógico. `409` si el registro está en uso o tiene existencias. |

Las entidades de permiso son `unit`, `tax`, `currency`, `category`, `product`, `customer`, `supplier` y `warehouse`. Cada alta, cambio o baja queda en la bitácora `audit_logs`.

### Inventario

| Ruta | Permiso | Descripción |
| --- | --- | --- |
| `POST /inventory/movements` | `inventory.movement.create` | `{ type: 'entry' \| 'exit' \| 'adjustment', productId, warehouseId, quantity, unitCost?, lotCode?, lotExpiresAt?, serialNumber?, reference? }`. Entrada y salida llevan cantidad positiva; el ajuste lleva signo. |
| `GET /inventory/movements/:id` | `inventory.movement.read` | Un movimiento. Los movimientos no se modifican ni se borran. |
| `POST /inventory/movements/:id/reverse` | `inventory.reversal.create` | `{ reason? }`. Crea el movimiento inverso enlazado. Revertir una pata de un traspaso revierte ambas. Un movimiento solo se revierte una vez. |
| `POST /inventory/transfers` | `inventory.transfer.create` | `{ productId, fromWarehouseId, toWarehouseId, quantity, lotCode?, serialNumber?, reference? }`. Salida y entrada atómicas. |
| `GET /inventory/stock` | `inventory.stock.read` | Existencias distintas de cero; filtros `productId` y `warehouseId`. |
| `GET /inventory/kardex/:productId` | `inventory.movement.read` | Movimientos en orden de folio, con saldo acumulado y `openingBalance`; filtros `warehouseId`, `from` y `to` (ISO 8601). |
| `GET /inventory/lots?productId=` | `inventory.lot.read` | Lotes o series de un producto. |
| `POST /inventory/lots` | `inventory.lot.create` | `{ productId, code, expiresAt? }`. Registra un lote o serie por adelantado. |
| `GET /inventory/settings` | `inventory.settings.read` (solo `admin`) | Política del tenant: `{ allowNegativeStock }`. |
| `PUT /inventory/settings` | `inventory.settings.update` (solo `admin`) | Cambia la política. Por defecto se rechaza el stock negativo. |
| `GET /inventory/reconciliation` | `inventory.reconciliation.read` (solo `admin`) | Recalcula existencias desde los movimientos y reporta diferencias con `stock_levels`. No corrige nada. |

Errores frecuentes: `INSUFFICIENT_STOCK` (409), `TRACKING_REQUIRED` (400), `SERIAL_ALREADY_IN_STOCK` (409), `MOVEMENT_ALREADY_REVERSED` (409), `INVALID_QUANTITY_PRECISION` (400, más decimales de los que permite la unidad) y `PRODUCT_NOT_STOCKABLE` (400, servicios).

La reconciliación también se puede ejecutar desde la terminal, contra la base de `.env.local`. El script sale con código 2 si encuentra diferencias:

```powershell
pnpm --filter @erp/api reconcile-inventory -- --tenant <id>
```

### Roles y permisos

Los módulos de construcción e identidad usan permisos `modulo.recurso:accion` con un mapa explícito por rol (`ROLE_PERMISSIONS` en `packages/domain`). Hay dos perfiles; `superadmin` hereda el de `admin`, y `manager` y `viewer` el de `user`.

| Permiso | user | admin |
| --- | --- | --- |
| `construction.dashboard:read`, `construction.projects:read`, `construction.proposals:read` | sí | sí |
| `construction.projects:update`, `:archive`, `:delete`, `:restore` | no | sí |
| `construction.proposals:create`, `:update`, `:submit`, `:approve`, `:reject`, `:delete`, `:restore` | no | sí |
| `construction.budget:read_amounts`, `construction.budget:adjust` | no | sí |
| `construction.certifications:update` | no | sí |
| `identity.profile:update` | sí | sí |
| `identity.users:manage` | no | sí |

Catálogos e inventario conservan sus permisos por acción (arriba). `GET /me` entrega ambas listas juntas y los clientes deciden con `can('permiso')`, nunca por el nombre del rol. Las cuentas nuevas se invitan con `POST /users/invitations`.

### Construcción

Módulo vertical en `/construction`: propuestas, obras, presupuesto y certificaciones. Detalle de las decisiones en [ADR 0004](docs/adr/0004-modulo-construccion.md).

| Ruta | Permiso | Descripción |
| --- | --- | --- |
| `GET /construction/dashboard` | `dashboard:read` | KPIs (obras activas, avance promedio, CO₂ evitado, % de presupuesto ejercido), obras en curso y certificaciones en proceso. Quien puede actuar recibe además `attention` ("Requiere tu atención"). |
| `GET /construction/projects` | `projects:read` | Paginado. Filtros `status`, `q` (nombre o cliente) y `archived=true` (exige `projects:archive`). |
| `GET /construction/projects/:id` | `projects:read` | Detalle con fases, requisitos de certificación, impacto, `delayDays`, resumen de presupuesto y `deletable`. |
| `PATCH /construction/projects/:id` | `projects:update` | Datos generales, fases (la lista reemplaza a la actual) y `progressPct`. |
| `POST /construction/projects/:id/transition` | `projects:update` | `{ to }`. Ciclo `planning` → `in_progress` → `certifying` → `completed`; cualquier otro salto responde 409 `INVALID_TRANSITION`. |
| `POST /construction/projects/:id/archive` y `/unarchive` | `projects:archive` | Archivar saca la obra de los listados activos y de los KPIs; no borra nada. |
| `DELETE /construction/projects/:id` | `projects:delete` | Borrado lógico. 409 `PROJECT_HAS_MOVEMENTS` si el presupuesto tiene algo más que el movimiento inicial. |
| `POST /construction/projects/:id/restore` | `projects:restore` | Saca la obra de la Papelera tal como estaba. |
| `GET /construction/projects/:id/budget-movements` | `budget:read_amounts` | Historial de movimientos, paginado. |
| `POST /construction/projects/:id/budget-movements` | `budget:adjust` | `{ amount, reason, reversesMovementId? }`. Siempre crea un `adjustment`. |
| `PATCH /construction/projects/:id/certification/requirements/:code` | `certifications:update` | `{ status, note }`. |
| `GET /construction/projects/:id/activity` | `projects:read` | Entradas de `auditLog` de la obra, paginadas. |
| `GET /construction/proposals` | `proposals:read` | Paginado. Filtros `status` y `q` (nombre, cliente o folio). |
| `GET /construction/proposals/:id` | `proposals:read` | Detalle. |
| `POST /construction/proposals` | `proposals:create` | Crea un borrador con folio `PRO`. Solo `name` es obligatorio; lo demás puede ir en `null`. |
| `PATCH /construction/proposals/:id` | `proposals:update` | Cambia solo lo enviado. 409 `NOT_EDITABLE` si no está en `draft`. |
| `POST /construction/proposals/:id/submit` | `proposals:submit` | `draft` → `in_review`. Si falta algo, 400 `VALIDATION_ERROR` con el detalle por campo. |
| `DELETE /construction/proposals/:id` | `proposals:delete` | Borrado lógico, solo en `draft` o `rejected`; si no, 409 `INVALID_TRANSITION`. |
| `POST /construction/proposals/:id/restore` | `proposals:restore` | Saca la propuesta de la Papelera con su estado. |
| `POST /construction/proposals/:id/approve` | `proposals:approve` | Aprueba y, en la misma transacción, crea la obra en `planning` y su movimiento `initial_budget`. La respuesta trae `projectId`. |
| `POST /construction/proposals/:id/reject` | `proposals:reject` | `{ reason }` obligatorio. |
| `GET /construction/trash` | `projects:restore` o `proposals:restore` | Obras y propuestas eliminadas (tipo, folio, nombre, fecha y quién las eliminó), solo de los tipos que el usuario puede restaurar. Paginado. |

Los permisos de la tabla llevan el prefijo `construction.`.

- **Dinero**: en JSON es un string con dos decimales (`"38600000.00"`), `Decimal128` en MongoDB y nunca `number`. El formato visual (`$38,600,000.00`) lo da `formatMoney` de `packages/domain`.
- **Montos según permiso**: sin `construction.budget:read_amounts` ninguna respuesta lleva montos (ni `estimatedBudget`, ni `currentBudget`, `spent`, `available`), solo porcentajes. Lo decide la API, no la interfaz.
- **Presupuesto derivado**: la obra no guarda montos. `currentBudget` (inicial + ajustes), `spent`, `available` y `spentPct` salen de una agregación sobre `budgetMovements`, que es inmutable. Para corregir un ajuste se registra otro con el monto contrario y `reversesMovementId`; solo una vez (409 `ALREADY_REVERSED`).
- **Retraso**: no es un estado. `delayDays` son los días desde el fin planeado de la fase en curso (la primera `in_progress`), si ya pasó.
- **Folios** por tenant con contador atómico (`counters`): `PRO-000001`, `OBR-000001`, `MOV-000001`.
- **Bitácora**: cada acción escribe en `auditLog` (`actorId`, `action`, `entityType`, `entityId`, `summary`, `at`). Los resúmenes nunca incluyen montos.
- **Propuestas en dos niveles**: el borrador acepta campos vacíos; enviar a revisión exige nombre, cliente, ubicación, tipo, alcance, fechas (entrega posterior al inicio), presupuesto, certificación objetivo y su nivel. Ambos esquemas están en `packages/domain`.
- La API aún no registra gastos: los carga el seed.

### Tiempo real

La app abre `wss://<api>/ws` y envía `{ "type": "auth", "token": "<accessToken>" }`. Cada cambio en una obra o propuesta difunde a las sesiones del mismo tenant un aviso sin datos (`{ type: 'construction.changed', entity, id }`) y la app vuelve a consultar la API, que responde según los permisos de cada usuario. El canal se reconecta solo y, al reconectar, recarga por si hubo cambios mientras estaba caído.

## Ejecutar la app móvil

La app se compone de tres procesos. Abre una terminal para cada uno en la raíz del repo.

1. **API**:

   ```powershell
   pnpm dev
   ```

2. **Metro**, el servidor que entrega el código JavaScript a la app:

   ```powershell
   pnpm --filter @erp/mobile start
   ```

3. **Instalar y abrir la app** en el emulador, que debe estar ya encendido:

   ```powershell
   pnpm --filter @erp/mobile android
   ```

   También puedes abrir la carpeta `apps/mobile/android` en Android Studio y pulsar Run. Metro debe seguir corriendo.

   Tras añadir o quitar dependencias nativas (como `react-native-keychain`) hay que volver a compilar con este paso; recargar Metro no basta.

La app guarda la sesión cifrada en el Keystore de Android (`react-native-keychain`).
### Crear el dispositivo virtual

1. En Android Studio abre Device Manager y pulsa Create Device.
2. Elige un teléfono Pixel (por ejemplo Pixel 6). El tamaño no afecta a la app.
3. Descarga y elige una imagen del sistema, por ejemplo API 34 (x86_64).
4. Finaliza y arráncalo con el botón de play.

El emulador necesita virtualización activada en la BIOS (VT-x o SVM) y Windows Hypervisor Platform.

### Dirección de la API desde la app

La URL está en `apps/mobile/src/lib/apiClient.ts`. En builds de desarrollo usa la API local (el emulador no ve `localhost` del PC: en Android es `10.0.2.2:3000`); en builds release usa la API de Render.

### Logo y recursos

Los logos están en `apps/mobile/src/assets`; el login usa `logo2.png`. El icono del launcher se genera en Android Studio: clic derecho en `res`, New, Image Asset.

## Ejecutar la web

Con la API corriendo (`pnpm dev`):

```powershell
pnpm --filter @erp/web dev
```

Abre `http://localhost:5173`. La web cubre el acceso (iniciar sesión, recuperar contraseña y activar la cuenta); las pantallas de construcción están por ahora solo en la app móvil. Para apuntar a otra API, define `VITE_API_URL` (por ejemplo en `apps/web/.env.local`). Sin ella, usa `http://localhost:3000` en desarrollo y la API de Render en el build de producción.

Para ver la sincronización, abre la app en dos dispositivos con usuarios del mismo tenant: aprobar una propuesta o registrar un ajuste en uno se refleja en el otro sin recargar.

## Desarrollo con Docker

MongoDB no se ejecuta localmente en esta fase: se configura con `MONGODB_URI` para apuntar a Atlas. Redis sí se levanta localmente:

```powershell
docker compose -f infra/docker-compose.yml up --build
```

Esto construye la imagen de la API, la publica en el puerto 3000 y lee las variables de `.env.local`.

## Despliegue

Los pasos para Atlas, Render y la app móvil de producción están en [docs/despliegue.md](docs/despliegue.md).

## Problemas frecuentes

**`pnpm` no se puede cargar porque la ejecución de scripts está deshabilitada.** PowerShell bloquea el script de pnpm. Se arregla una vez con:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

También puedes usar `pnpm.cmd` o la terminal Command Prompt.

**La API no arranca y menciona una variable de entorno.** Falta o es inválida alguna variable de `.env.local`. El mensaje indica cuál.

**`/health` devuelve `503`.** La API arrancó pero no llega a MongoDB. Revisa la URI y que tu IP esté permitida en Network Access de Atlas.

**La app dice "No se pudo conectar con el servidor".** La API no está corriendo, o el emulador no la alcanza. Confirma que `pnpm dev` está activo y que es un build de desarrollo (usa `10.0.2.2`).

**La app se cierra con `RNKeychainManager` o un módulo nativo no encontrado.** La app no se recompiló tras instalar dependencias nativas: `pnpm --filter @erp/mobile android`.

**La web desplegada no puede iniciar sesión (error de CORS).** Falta el dominio de la web en `CORS_ORIGINS` de Render.

**Aparece el banner "Sin conexión".** El dispositivo no tiene red o no llega a internet (lo detecta NetInfo). No hay caché sin conexión: las listas se vuelven a pedir solas al volver la red.

**La invitación no llega.** Con el remitente de pruebas `onboarding@resend.dev`, Resend solo entrega al correo dueño de la cuenta de Resend. Si `RESEND_API_KEY` está vacía, el correo solo se registra en el log. La respuesta de la invitación trae `emailSent: false` cuando el envío falló; desde el detalle del usuario se puede reenviar.

**Invitar mi propio correo responde `EMAIL_IN_USE`.** Ya existe una cuenta con ese correo (en cualquier empresa). Si es una de las cuentas del seed, vuelve a correrlo sobre una base limpia con `SEED_ADMIN_EMAIL` y `SEED_USER_EMAIL` distintos a tu correo.

**La app no encuentra Metro o muestra pantalla roja.** Verifica que `pnpm --filter @erp/mobile start` esté activo. Con el emulador, `adb reverse tcp:8081 tcp:8081` suele resolverlo.

**Cambios que no se ven en la app.** Pulsa `R` dos veces en el emulador, o reinicia Metro con `--reset-cache`.

## Decisiones de arquitectura

Las decisiones base del stack están en [docs/adr/0001-stack-y-decisiones.md](docs/adr/0001-stack-y-decisiones.md). Las de catálogos e inventario (concurrencia, stock negativo, folios, reversas, lotes y series) están en [docs/adr/0002-catalogos-e-inventario.md](docs/adr/0002-catalogos-e-inventario.md); las de acceso, en [docs/adr/0003-acceso-y-consultas-sin-tenant.md](docs/adr/0003-acceso-y-consultas-sin-tenant.md); las del módulo de construcción, en [docs/adr/0004-modulo-construccion.md](docs/adr/0004-modulo-construccion.md); y las de propuestas, usuarios y papelera, en [docs/adr/0005-propuestas-usuarios-y-papelera.md](docs/adr/0005-propuestas-usuarios-y-papelera.md).
