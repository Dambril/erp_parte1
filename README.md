# T-Ssera Construcciones · ERP de obras

ERP multi-empresa para constructoras con enfoque ecológico: avance físico, presupuesto ejercido, certificaciones ambientales (LEED, EDGE) e impacto medido (CO₂, energía, agua) de todas las obras en un panel. Incluye API (Express + MongoDB Atlas), app Android (React Native) y web (React + Vite), sincronizadas en tiempo real.

## Estructura del repositorio

Monorepo con workspaces de pnpm.

| Carpeta | Contenido |
| --- | --- |
| `apps/api` | API REST + canal WebSocket (Node.js + Express). Módulos `identity` y `obras` en `src/modules`. |
| `apps/mobile` | App Android (React Native 0.73). Proyecto nativo en `apps/mobile/android`. |
| `apps/web` | Panel web (React + Vite), publicado en Cloudflare Pages. |
| `packages/domain` | Esquemas (Zod), tipos y reglas de negocio compartidas: estados, transiciones, resumen del dashboard, permisos, dinero. |
| `packages/api-client` | Cliente HTTP con sesión y renovación de tokens, canal en tiempo real y `ObrasStore`, compartido por app y web. |
| `packages/ui` | Componentes de React Native compartidos. |
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
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Sí | Mínimo 8 caracteres. Usa valores distintos y largos en producción. |
| `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | No | Por defecto `15m` y `7d`. |
| `DEFAULT_TENANT_ID` | Sí | Tenant por defecto en desarrollo. |
| `PORT` | No | Por defecto `3000`. |
| `REDIS_URL` | No | Solo hará falta cuando existan jobs con BullMQ. |
| `RESEND_API_KEY` | No | API key de Resend. Sin ella los correos no se envían (solo log). |
| `EMAIL_FROM` | No | Remitente. Por defecto `ERP <onboarding@resend.dev>`, que solo entrega al correo dueño de la cuenta de Resend. |
| `PASSWORD_RESET_URL` | No | Pantalla de restablecer contraseña; el correo añade `?token=...`. Sin ella, el correo trae el código. |
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

Todas las rutas salvo `/health` y `/auth/*` exigen `Authorization: Bearer <accessToken>`. El tenant se toma del token.

| Ruta | Descripción |
| --- | --- |
| `POST /auth/login` | `{ email, password }` → `accessToken`, `refreshToken` y el usuario. Máximo 10 intentos por IP cada 15 minutos. |
| `POST /auth/refresh` | `{ refreshToken }` → par de tokens nuevo. El anterior queda invalidado; reutilizarlo cierra todas las sesiones. |
| `POST /auth/logout` | `{ refreshToken }` → revoca la sesión. |
| `POST /auth/forgot-password` | `{ email }` → 202 siempre (no revela si el email existe); envía el correo con el token (vence en 60 min). |
| `POST /auth/reset-password` | `{ token, password }` → 204. Token de un solo uso; cierra todas las sesiones del usuario. |
| `GET /auth/me` | Usuario autenticado. |
| `GET /users` | Usuarios del tenant (solo `admin`). |
| `POST /users` | Crea un usuario en el tenant: `{ email, name, password, role? }` (solo `admin`). |

El primer administrador se crea desde la terminal. La contraseña va en una variable de entorno para que no quede en el historial, y el usuario se crea en la base a la que apunte `.env.local`:

```powershell
$env:ADMIN_PASSWORD = 'una-contraseña-larga'
pnpm --filter @erp/api create-admin -- --email admin@empresa.com --name "Administrador"
Remove-Item Env:ADMIN_PASSWORD
```

Opcionales: `--tenant <id>` (por defecto `DEFAULT_TENANT_ID`) y `--role superadmin`.

Para tener datos con los que probar, carga las 6 obras de ejemplo del prototipo en el tenant (solo si está vacío):

```powershell
pnpm --filter @erp/api seed-demo
```

### Convenciones de la API

- Las respuestas exitosas tienen la forma `{ success: true, data, timestamp }`. Los listados devuelven en `data` el objeto `{ items, page, pageSize, total }` y aceptan `?page=` (desde 1), `?pageSize=` (máximo 100) y, en catálogos, `?q=` como búsqueda de texto literal.
- Cantidades, costos, precios y tasas viajan como **texto decimal** (`"12.50"`), nunca como número; se guardan como `Decimal128`.
- Cada ruta exige un permiso `módulo.acción` (catálogo en `PERMISSION_CATALOG` de `packages/domain`). Con los roles actuales, `viewer` solo lee, `user` lee y crea, `manager` también modifica y aprueba (acción `approve`, hoy solo en obras) y `admin` puede todo. Algunas rutas son solo para `admin`.

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

### Roles

| Rol | Puede |
| --- | --- |
| `admin` / `superadmin` | Todo, incluido gestionar usuarios y eliminar obras. |
| `manager` (gerente de proyecto) | Ver, crear y editar obras; aprobar o solicitar cambios. |
| `user` (residente de obra) | Ver obras, crear propuestas y registrar mediciones ambientales. |
| `viewer` | Solo consulta. |

Crea usuarios con `POST /users` (como admin) indicando `role`.

### Obras

| Ruta | Descripción |
| --- | --- |
| `GET /obras?estado=&q=` | Obras del tenant; filtro por estado derivado y búsqueda por nombre, cliente o ubicación. |
| `GET /obras/resumen` | KPIs del dashboard: activas, retrasadas, avance promedio, CO₂ medido, presupuesto ejercido, certificaciones en curso. |
| `GET /obras/:id` | Ficha completa. |
| `POST /obras` | Crea una obra en etapa `propuesta`. |
| `PATCH /obras/:id` | Actualiza campos (fases y materiales se reemplazan completos). |
| `POST /obras/:id/aprobar` | Propuesta → ejecución → certificación (o completada si no tiene) → completada. Cerrar la ejecución exige todas las fases al 100%. |
| `POST /obras/:id/solicitar-cambios` | `{ comentario }`. En propuesta queda registrada; en certificación regresa a ejecución. |
| `POST /obras/:id/mediciones` | Registra CO₂ evitado, energía y agua medidos; su suma es el impacto real de la obra. |
| `DELETE /obras/:id` | Borrado lógico (solo admin). |

El **estado** que ven los usuarios se calcula al leer: una obra en ejecución pasa a `retrasada` cuando una fase venció sin terminarse o va 20 puntos por debajo del avance esperado. Toda acción queda en la colección `audit_log`.

### Tiempo real

La web y la app abren `wss://<api>/ws` y envían `{ "type": "auth", "token": "<accessToken>" }`. Cada cambio en una obra se difunde a las sesiones del mismo tenant, así lo que se aprueba en la web aparece al instante en la app y al revés. El canal se reconecta solo y, al reconectar, recarga la lista por si hubo cambios mientras estaba caído.

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

Abre `http://localhost:5173`. Para apuntar a otra API, define `VITE_API_URL` (por ejemplo en `apps/web/.env.local`). Sin ella, usa `http://localhost:3000` en desarrollo y la API de Render en el build de producción.

Para ver la sincronización, abre la web y la app con usuarios del mismo tenant: aprobar una obra, mover el avance de una fase o registrar una medición en una se refleja en la otra sin recargar.

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

**El indicador dice "Sin conexión" pero los datos cargan.** El canal WebSocket no se pudo abrir (proxy o red que lo bloquea); los datos siguen funcionando, pero sin actualizaciones en vivo hasta que se reconecte.

**La app no encuentra Metro o muestra pantalla roja.** Verifica que `pnpm --filter @erp/mobile start` esté activo. Con el emulador, `adb reverse tcp:8081 tcp:8081` suele resolverlo.

**Cambios que no se ven en la app.** Pulsa `R` dos veces en el emulador, o reinicia Metro con `--reset-cache`.

## Decisiones de arquitectura

Las decisiones base del stack están en [docs/adr/0001-stack-y-decisiones.md](docs/adr/0001-stack-y-decisiones.md). Las de catálogos e inventario (concurrencia, stock negativo, folios, reversas, lotes y series) están en [docs/adr/0002-catalogos-e-inventario.md](docs/adr/0002-catalogos-e-inventario.md).
