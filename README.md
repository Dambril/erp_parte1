# ERP multi-empresa

Esqueleto de la fase 0 para un ERP multi-tenant con TypeScript, Express, MongoDB Atlas, React Native/Web y Redis.

## Estructura del repositorio

Monorepo con workspaces de pnpm.

| Carpeta | Contenido |
| --- | --- |
| `apps/api` | API REST (Node.js + Express). Módulos de negocio reservados en `src/modules`. |
| `apps/mobile` | App Android (React Native 0.73). Proyecto nativo en `apps/mobile/android`. |
| `apps/web` | Cliente web (React Native Web), aún sin pantallas. |
| `packages/api-client` | Cliente HTTP compartido por móvil y web. |
| `packages/ui` | Componentes de interfaz compartidos. |
| `packages/domain` | Tipos de dominio compartidos. |
| `packages/config` | Carga y validación (Zod) de las variables de entorno. |
| `infra` | `Dockerfile` de la API y `docker-compose.yml` (API + Redis). |
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

## Ejecutar la app móvil

La app se compone de tres procesos. Abre una terminal para cada uno en la raíz del repo.

1. **API** (la app la consulta para mostrar su estado):

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

### Crear el dispositivo virtual

1. En Android Studio abre Device Manager y pulsa Create Device.
2. Elige un teléfono Pixel (por ejemplo Pixel 6). El tamaño no afecta a la app.
3. Descarga y elige una imagen del sistema, por ejemplo API 34 (x86_64).
4. Finaliza y arráncalo con el botón de play.

El emulador necesita virtualización activada en la BIOS (VT-x o SVM) y Windows Hypervisor Platform.

### Dirección de la API desde la app

El emulador no ve `localhost` del PC: en Android usa `10.0.2.2`. La URL está en `apps/mobile/App.tsx` (`http://10.0.2.2:3000`). Para probar contra la API desplegada hay que cambiarla por la URL pública.

### Logo y recursos

Los logos están en `apps/mobile/src/assets`. La pantalla de inicio usa `logo1.png` y se ajusta con `LOGO_ZOOM` en `App.tsx`. El icono del launcher se genera en Android Studio: clic derecho en `res`, New, Image Asset.

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

**La app muestra `error: Network request failed`.** La API no está corriendo, o el emulador no la alcanza. Confirma que `pnpm dev` está activo y que `App.tsx` usa `10.0.2.2` en el emulador.

**La app no encuentra Metro o muestra pantalla roja.** Verifica que `pnpm --filter @erp/mobile start` esté activo. Con el emulador, `adb reverse tcp:8081 tcp:8081` suele resolverlo.

**Cambios que no se ven en la app.** Pulsa `R` dos veces en el emulador, o reinicia Metro con `--reset-cache`.

## Decisiones de arquitectura

Las decisiones base del stack están en [docs/adr/0001-stack-y-decisiones.md](docs/adr/0001-stack-y-decisiones.md).
