# Despliegue

Guía para publicar el ERP: base de datos en MongoDB Atlas, API en Render y app Android instalable.

## 1. MongoDB Atlas

1. Crea un cluster (el plan gratuito M0 sirve para empezar).
2. En Database Access, crea un usuario con contraseña y permisos de lectura y escritura.
3. En Network Access, permite la IP de la API. Render no tiene IP fija en el plan gratuito, así que para empezar se usa `0.0.0.0/0`. Endurécelo cuando pases a un plan con IPs de salida fijas.
4. En Connect, copia la URI `mongodb+srv://...` y sustituye usuario y contraseña. Si la contraseña tiene caracteres especiales, codifícalos en formato URL.

Esta URI será el valor de `MONGODB_URI`.

## 2. API en Render

Render construye la imagen con `infra/Dockerfile`, que se ejecuta desde la raíz del repo.

1. Crea un Web Service y conecta el repositorio de GitHub.
2. Elige la rama a desplegar y el runtime **Docker**.
3. Indica `infra/Dockerfile` como Dockerfile y deja el contexto en la raíz.
4. En Environment, define:

   | Variable | Valor |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `MONGODB_URI` | La URI de Atlas. |
   | `MONGODB_DB_NAME` | `erp` |
   | `JWT_SECRET` | Secreto largo y aleatorio. |
   | `JWT_REFRESH_SECRET` | Otro secreto largo, distinto del anterior. |
   | `DEFAULT_TENANT_ID` | El tenant por defecto. |

   Render define `PORT` por su cuenta y la API lo respeta. No subas estos valores al repositorio.
5. En Health Check Path, pon `/health`.
6. Despliega y comprueba `https://<tu-servicio>.onrender.com/health`. Debe responder `status: ok` y `database: connected`.

En el plan gratuito el servicio se duerme tras un tiempo sin tráfico y la primera petición tarda en responder.

## 3. App Android

La app tiene la URL de la API fija en `apps/mobile/App.tsx`. Para producción:

1. Cambia `baseUrl` por la URL de Render (con `https`), sin dejar `10.0.2.2` en el build de producción.
2. Genera tu propio keystore. El proyecto firma los builds release con `debug.keystore` (`apps/mobile/android/app/build.gradle`), que no sirve para publicar:

   ```powershell
   keytool -genkeypair -v -storetype PKCS12 -keystore erp-release.keystore -alias erp -keyalg RSA -keysize 2048 -validity 10000
   ```

   Guarda el archivo y las contraseñas fuera del repositorio.
3. Configura ese keystore como `signingConfig` de `release` en `build.gradle`, leyendo las contraseñas de variables de entorno o de `~/.gradle/gradle.properties`.
4. Genera el paquete desde `apps/mobile/android`:

   ```powershell
   .\gradlew.bat assembleRelease   # APK para instalar directamente
   .\gradlew.bat bundleRelease     # AAB para Play Store
   ```

   Los archivos quedan en `apps/mobile/android/app/build/outputs`.
5. Antes de publicar, sube `versionCode` en `build.gradle` y cambia el nombre visible en `res/values/strings.xml` si lo necesitas.
6. Sustituye el icono del launcher por el del ERP (Android Studio, Image Asset).

## Lista de comprobación

- [ ] Cluster de Atlas creado, usuario y acceso de red configurados.
- [ ] Variables de entorno cargadas en Render, con secretos JWT nuevos.
- [ ] `/health` en Render responde `ok` y `connected`.
- [ ] `baseUrl` de la app apunta a la API de Render.
- [ ] Keystore de release propio y fuera del repositorio.
- [ ] APK o AAB probado en un dispositivo.
