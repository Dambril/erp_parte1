# Despliegue

Guía para publicar el ERP: base de datos en MongoDB Atlas, API en Render, web en Cloudflare Pages y app Android instalable.

## 1. MongoDB Atlas

1. Crea un cluster (el plan gratuito M0 sirve para empezar).
2. En Database Access, crea un usuario con contraseña y permisos de lectura y escritura.
3. En Network Access, permite la IP de la API. Render no tiene IP fija en el plan gratuito, así que para empezar se usa `0.0.0.0/0`. Endurécelo cuando pases a un plan con IPs de salida fijas.
4. En Connect, copia la URI `mongodb+srv://...` y sustituye usuario y contraseña. Si la contraseña tiene caracteres especiales, codifícalos en formato URL.

Esta URI será el valor de `MONGODB_URI`.

## 2. API en Render

Render construye la imagen con `infra/Dockerfile`, que se ejecuta desde la raíz del repo.

La forma recomendada es el Blueprint [`render.yaml`](../render.yaml): en Render, *New → Blueprint*, elige el repositorio y rellena `MONGODB_URI` y `MONGODB_DB_NAME` cuando lo pida (los secretos JWT se generan solos). Los pasos siguientes son la alternativa manual.

1. Crea un Web Service y conecta el repositorio de GitHub.
2. Elige la rama a desplegar y el runtime **Docker**.
3. Indica `infra/Dockerfile` como Dockerfile y deja el contexto en la raíz.
4. En Environment, define:

   | Variable | Valor |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `MONGODB_URI` | La URI de Atlas. |
   | `MONGODB_DB_NAME` | Nombre de la base (el mismo que uses en `.env.local`). |
   | `JWT_SECRET` | Secreto largo y aleatorio. |
   | `APP_WEB_URL` | URL pública de la web (Cloudflare Pages); los correos enlazan a ella. |
   | `RESEND_API_KEY` | API key de Resend, para los correos de recuperación. |
   | `DEFAULT_TENANT_ID` | El tenant por defecto. |
   | `CORS_ORIGINS` | Opcional. URLs de la web que consumirá la API, separadas por comas. |

   Render define `PORT` por su cuenta y la API lo respeta. No subas estos valores al repositorio.
5. En Health Check Path, pon `/health`.
6. Despliega y comprueba `https://<tu-servicio>.onrender.com/health`. Debe responder `status: ok` y `database: connected`.

En el plan gratuito el servicio se duerme tras 15 minutos sin tráfico y la primera petición tarda en responder. Para evitarlo, despliega el Worker de la sección siguiente.

### Mantener la API despierta (Cloudflare Worker)

[`infra/cloudflare/keepalive`](../infra/cloudflare/keepalive) es un Worker con Cron Trigger que llama a `/health` cada 10 minutos. Solo necesita una cuenta gratuita de Cloudflare (sin dominio).

```powershell
cd infra/cloudflare/keepalive
npx wrangler login    # abre el navegador para autorizar tu cuenta
npx wrangler deploy
```

Los logs de cada ejecución se ven en Cloudflare → Workers & Pages → `erp-api-keepalive` → Logs, o con `npx wrangler tail`. Si cambia la URL de la API, actualiza `API_HEALTH_URL` en `wrangler.toml` y vuelve a desplegar.

Render da 750 horas gratuitas al mes por cuenta: alcanzan para un servicio encendido todo el mes, pero no para dos.

Para poder iniciar sesión hace falta la empresa y sus primeras cuentas: créalas con `pnpm --filter @erp/api seed` (ver [README](../README.md#autenticación)) desde tu equipo con `.env.local` apuntando a la misma base que Render. Con la misma configuración, `pnpm --filter @erp/api seed-demo` carga obras de ejemplo si quieres enseñar el sistema con datos.

La API no necesita nada extra para el tiempo real: Render admite WebSocket en el mismo servicio (`wss://<servicio>.onrender.com/ws`). Los sockets viven en memoria, así que el servicio debe tener **una sola instancia**; para escalar a varias habría que añadir un pub/sub (Redis).

Recomendado: en Render → `erp-api` → Settings → **Auto-Deploy**, elige *After CI Checks Pass* para que no se despliegue un commit que rompe los tests.

## 3. Web en Cloudflare Pages

1. En Cloudflare → Workers & Pages → Create → Pages → **Connect to Git** y elige el repositorio.
2. Configuración de build:

   | Campo | Valor |
   | --- | --- |
   | Production branch | La rama que despliegas (hoy `desarrollo`). |
   | Build command | `pnpm install --frozen-lockfile && pnpm --filter @erp/web build` |
   | Build output directory | `apps/web/dist` |
   | Root directory | *(vacío: la raíz del repo)* |
   | Variables | `NODE_VERSION` = `20`. Opcional: `VITE_API_URL` si la API no es la de Render por defecto. |

3. Tras el primer despliegue tendrás una URL `https://<proyecto>.pages.dev`.
4. En Render → `erp-api` → Environment, añade `CORS_ORIGINS` con esa URL (sin `/` final). Sin esto el navegador bloquea el login. Si usas previews de ramas, añade también sus URLs separadas por comas.

Alternativa sin conectar Git (desde tu equipo, ya autenticado con `wrangler login`):

```powershell
pnpm --filter @erp/web build
npx wrangler pages deploy apps/web/dist --project-name tssera-erp
```

`apps/web/public/_headers` añade cabeceras de seguridad básicas. La sesión de la web vive en `sessionStorage`: se cierra al cerrar la pestaña.

## 4. App Android

La URL de la API está en `apps/mobile/src/lib/apiClient.ts`: los builds release ya usan la de Render. Para producción:

1. Genera tu propio keystore. Sin él, los builds release se firman con `debug.keystore`, que sirve para probar pero no para publicar:

   ```powershell
   keytool -genkeypair -v -storetype PKCS12 -keystore tssera-upload.keystore -alias tssera -keyalg RSA -keysize 2048 -validity 10000
   ```

   Guarda el archivo y las contraseñas fuera del repositorio (y haz un respaldo: si lo pierdes no podrás actualizar la app en Play Store).
2. Añade a `%USERPROFILE%\.gradle\gradle.properties` (fuera del repo):

   ```properties
   TSSERA_UPLOAD_STORE_FILE=C:/ruta/a/tssera-upload.keystore
   TSSERA_UPLOAD_STORE_PASSWORD=...
   TSSERA_UPLOAD_KEY_ALIAS=tssera
   TSSERA_UPLOAD_KEY_PASSWORD=...
   ```

   `build.gradle` usa ese keystore automáticamente cuando esas propiedades existen.
3. El identificador de la app es `com.tssera.construcciones` y el nombre visible `T-Ssera`. El identificador no se puede cambiar después de la primera subida a Play Store.
4. Genera el paquete desde `apps/mobile/android`:

   ```powershell
   .\gradlew.bat assembleRelease   # APK para instalar directamente
   .\gradlew.bat bundleRelease     # AAB para Play Store
   ```

   Los archivos quedan en `apps/mobile/android/app/build/outputs`.
5. Antes de cada publicación, sube `versionCode` en `build.gradle`.
6. Sustituye el icono del launcher por el del ERP (Android Studio, Image Asset).
7. Play Store exige una URL pública con la política de privacidad de la app.

## Lista de comprobación

- [ ] Cluster de Atlas creado, usuario y acceso de red configurados.
- [ ] Variables de entorno cargadas en Render, con secretos JWT nuevos.
- [ ] `/health` en Render responde `ok` y `connected`.
- [ ] Empresa y cuentas iniciales creadas con `seed` y login probado.
- [ ] Usuarios con sus roles creados (`POST /users`).
- [ ] Web publicada en Cloudflare Pages y su URL en `CORS_ORIGINS` de Render.
- [ ] Worker keepalive desplegado.
- [ ] Keystore de release propio, fuera del repositorio y respaldado.
- [ ] APK o AAB probado en un dispositivo, con la sincronización web ↔ app funcionando.
- [ ] Política de privacidad publicada (requisito de Play Store).
