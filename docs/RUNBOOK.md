# Guía de ejecución y verificación

Cómo levantar el sistema completo en un equipo con Windows, probarlo y llevarlo a un teléfono Android.

Los comandos están en PowerShell y se ejecutan desde la raíz del repo, salvo que se indique otra carpeta.
Cada bloque dice si se ejecutó al escribir esta guía (**ejecutado**) o no (**no ejecutado aquí**).

## 1. Requisitos

| Herramienta | Versión | De dónde sale |
|---|---|---|
| Node.js | 20 o superior (`engines` de `package.json`; CI usa 20; se probó con 24.21.0) | nodejs.org |
| pnpm | 9.0.0 (`packageManager` de `package.json`) | `corepack enable; corepack prepare pnpm@9.0.0 --activate` |
| JDK | 17 (Gradle 8.3 no funciona con versiones más nuevas) | Android Studio lo instala, o Adoptium 17 |
| Android SDK | Plataforma 34 y Build-Tools 34.0.0 (`apps/mobile/android/build.gradle`) | Android Studio → SDK Manager |
| Docker | Opcional. La API **no** necesita Redis para arrancar (`REDIS_URL` es opcional) | — |

No se usa Expo: la app es React Native CLI 0.73.6 y se compila con Gradle.

## 2. Cuentas externas y credenciales

No pegues claves en chats ni en archivos del repo. Cada valor va en el archivo que indica la tabla de la sección 3.

### MongoDB Atlas

1. Crea una cuenta en cloud.mongodb.com y un clúster **Free** (antes "M0").
2. **Database Access** → *Add New Database User*: usuario y contraseña, con rol *Read and write to any database*.
3. **Network Access** → *Add IP Address* → *Add Current IP Address*. Si tu IP cambia, repite este paso.
4. **Database** → *Connect* → *Drivers*: copia la cadena `mongodb+srv://...` y sustituye usuario y contraseña. Si la
   contraseña tiene caracteres especiales, codifícalos en formato URL. Va en `MONGODB_URI`.

Transacciones: según la documentación de Atlas, un clúster Free es una réplica de 3 nodos, y MongoDB soporta
transacciones multidocumento en réplicas. El sistema las usa (aprobar propuestas, ajustes, invitaciones).
Fuentes: [límites del clúster Free](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/) y
[transacciones en producción](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/).

### Resend

1. Crea una cuenta en resend.com con **el correo donde quieres recibir las pruebas**.
2. **API Keys** → *Create API Key* (permiso *Sending access*). Cópiala al momento: no se vuelve a mostrar. Va en
   `RESEND_API_KEY`.
3. **Advertencia:** el remitente de pruebas `onboarding@resend.dev` **solo entrega al correo del dueño de la cuenta de
   Resend**. Cualquier otro destinatario se rechaza. Para escribir a otras personas hay que verificar un dominio
   propio en Resend y poner un remitente de ese dominio en `EMAIL_FROM`.

### Expo

No aplica.

## 3. Variables de entorno

Los archivos `.env.example` (raíz) y `apps/web/.env.example` contienen exactamente estas variables.

### API: `.env.local` en la raíz del repo

| Variable | Para qué sirve | Formato de ejemplo | Obligatoria | Cómo obtenerla |
|---|---|---|---|---|
| `MONGODB_URI` | Conexión a Atlas | `mongodb+srv://<usuario>:<contraseña>@<cluster>.mongodb.net/?retryWrites=true&w=majority` | Sí | Atlas → Connect |
| `MONGODB_DB_NAME` | Nombre de la base | `erp` | No | La eliges tú |
| `JWT_SECRET` | Firma de los access tokens | 64 caracteres aleatorios | Sí (mínimo 8) | `openssl rand -base64 48` |
| `JWT_EXPIRES_IN` | Vida del access token | `15m` | No | — |
| `NODE_ENV` | Modo | `development` | No | — |
| `PORT` | Puerto de la API | `3000` | No | — |
| `DEFAULT_TENANT_ID` | Tenant por defecto de los scripts | `dev-tenant-001` | Sí | La eliges tú |
| `CORS_ORIGINS` | Orígenes web permitidos, separados por comas | `http://localhost:5173,http://192.168.1.50:5173` | En producción | URL de tu web |
| `REDIS_URL` | Cola de trabajos (aún sin uso) | `redis://localhost:6379` | No | — |
| `RESEND_API_KEY` | Envío de correos | `re_xxxxxxxx` | No (sin ella no se envían) | Resend → API Keys |
| `EMAIL_FROM` | Remitente visible | `T-ssera Construcciones <onboarding@resend.dev>` | No | — |
| `APP_WEB_URL` | Base de los enlaces de los correos | `http://localhost:5173` | En producción | URL de tu web |
| `SEED_TENANT_ID` | Identificador de la empresa de prueba | `tssera-demo` | Para el seed | La eliges tú |
| `SEED_COMPANY_NAME` | Nombre de la empresa | `T-ssera Construcciones` | Para el seed | La eliges tú |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME`, `SEED_ADMIN_PASSWORD` | Cuenta administradora | correo, nombre, 15 a 128 caracteres | Para el seed | Las eliges tú |
| `SEED_USER_EMAIL`, `SEED_USER_NAME`, `SEED_USER_PASSWORD` | Cuenta de rol `user` | correo, nombre, 15 a 128 caracteres | Para el seed | Las eliges tú |

La API valida estas variables al arrancar (`packages/config`). Si falta una, se detiene y dice cuál, sin mostrar valores:

```text
Configuración inválida. Revisa .env.local (plantilla: .env.example):
  - MONGODB_URI: falta
```

### Web: `apps/web/.env.local` (opcional)

| Variable | Para qué sirve | Formato de ejemplo | Obligatoria | Notas |
|---|---|---|---|---|
| `VITE_API_URL` | URL de la API | `http://192.168.1.50:3000` | No | Vacía en desarrollo: usa el mismo equipo que sirve la web, puerto 3000 |

### App Android: variable de la terminal al compilar

| Variable | Para qué sirve | Formato de ejemplo | Obligatoria | Notas |
|---|---|---|---|---|
| `TSSERA_API_URL` | URL de la API que queda dentro del APK | `http://192.168.1.50:3000` | Sí en release | En desarrollo, sin ella, usa `http://10.0.2.2:3000` (emulador) |

### Firma del APK: `C:\Users\<tú>\.gradle\gradle.properties` (fuera del repo)

| Propiedad | Para qué sirve | Formato de ejemplo |
|---|---|---|
| `TSSERA_UPLOAD_STORE_FILE` | Ruta de la llave | `C:/Users/<tú>/keystores/tssera-upload.keystore` |
| `TSSERA_UPLOAD_STORE_PASSWORD` | Contraseña del almacén | la que elegiste en `keytool` |
| `TSSERA_UPLOAD_KEY_ALIAS` | Alias de la llave | `tssera` |
| `TSSERA_UPLOAD_KEY_PASSWORD` | Contraseña de la llave | la misma (PKCS12 usa una sola) |

## 4. Orden de arranque

```powershell
# 1. Dependencias (ejecutado)
pnpm install --frozen-lockfile

# 2. Variables de entorno: copia la plantilla y llénala (no ejecutado aquí: los valores son tuyos)
Copy-Item .env.example .env.local

# 3. Redis: no hace falta. Si lo quieres (no ejecutado aquí: Docker estaba apagado):
docker compose -f infra/docker-compose.yml up redis

# 4. Seed: crea la empresa, las dos cuentas de SEED_* y los datos de demostración (no ejecutado aquí: escribe en tu Atlas)
pnpm --filter @erp/api seed

# 5. API en http://localhost:3000 (no ejecutado aquí contra Atlas; ver la alternativa de abajo)
pnpm dev

# 6. Web en http://localhost:5173, en otra terminal (ejecutado)
pnpm --filter @erp/web dev
```

**Alternativa sin Atlas ni Resend (ejecutado):** sustituye los pasos 4 y 5 por una API con base en memoria. Solo
necesita las `SEED_*`. Los datos se pierden al detenerla y los correos no se envían: su enlace se imprime en la terminal.

```powershell
pnpm --filter @erp/api dev:memory
```

Comprueba la API: `curl.exe http://localhost:3000/health` debe responder `"status":"ok"` (ejecutado).

### App móvil en el emulador (no ejecutado aquí en modo desarrollo)

Con un dispositivo virtual encendido (Android Studio → Device Manager) y la API corriendo:

```powershell
pnpm --filter @erp/mobile start      # Metro, en una terminal
pnpm --filter @erp/mobile android    # compila e instala, en otra
```

El emulador llega a la API del equipo por `http://10.0.2.2:3000`; no hay que configurar nada.

### App móvil en un teléfono físico

Lo más simple es instalar el APK (sección 9). Para desarrollo con Metro (no ejecutado aquí): conecta el teléfono por
USB con la depuración activada y arranca Metro con la URL de tu equipo.

```powershell
$env:TSSERA_API_URL = "http://<IP-de-tu-equipo>:3000"
pnpm --filter @erp/mobile start -- --reset-cache
adb reverse tcp:8081 tcp:8081
pnpm --filter @erp/mobile android
```

## 5. Red para el celular

El teléfono no puede usar `localhost`: ahí `localhost` es el propio teléfono. Debe estar en la misma red Wi-Fi que el equipo.

1. **IP del equipo** (ejecutado): busca "Dirección IPv4" del adaptador Wi-Fi.

   ```powershell
   ipconfig
   ```

2. **Firewall** (no ejecutado aquí: requiere PowerShell como administrador). Abre el puerto de la API y, si vas a usar
   la web desde el teléfono, el de Vite:

   ```powershell
   New-NetFirewallRule -DisplayName "T-ssera API 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
   New-NetFirewallRule -DisplayName "T-ssera Web 5173" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow -Profile Private
   ```

   La red Wi-Fi debe estar marcada como **Privada** en Windows.
3. **Prueba desde el teléfono:** abre `http://<IP>:3000/health` en su navegador. Si no responde, el problema es de red
   o firewall, no de la app.
4. **URL en la app:** se define al compilar el APK con `TSSERA_API_URL` (sección 9). Si la IP cambia, recompila.
5. **Web desde el teléfono** (no ejecutado aquí): `pnpm --filter @erp/web dev -- --host` y abre `http://<IP>:5173`.
   La web encuentra la API sola en `http://<IP>:3000`.

## 6. Credenciales de prueba

- Las cuentas salen de `SEED_*` en `.env.local`: `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD` para el rol `admin`;
  `SEED_USER_EMAIL` y `SEED_USER_PASSWORD` para el rol `user`. No hay credenciales escritas en el repo.
- El seed no modifica cuentas que ya existen: cambiar `SEED_*` después no cambia la contraseña.
- **Para que lleguen los correos de recuperación e invitación** con el remitente de pruebas de Resend, el destinatario
  debe ser el correo dueño de tu cuenta de Resend:
  - Recuperación: pon ese correo en `SEED_ADMIN_EMAIL` **antes** de correr el seed, y pide la recuperación de esa cuenta.
  - Invitación: el correo es único en la plataforma. Si ya lo usaste en el seed no podrás invitarlo; en ese caso usa
    en el seed otros correos e invita al tuyo.
- En local, deja `APP_WEB_URL=http://localhost:5173` para que los enlaces de los correos abran tu web local.

## 7. Lista de verificación funcional

Los criterios de aceptación originales de los bloques no están en el repo; esta lista sale de lo que documentan los
ADR 0003 a 0006. Sirve igual en la web y en la app.

### Bloque 1: acceso

| # | Qué hacer | Qué debes ver | Rol |
|---|---|---|---|
| 1.1 | Inicia sesión con una contraseña incorrecta | "Correo o contraseña incorrectos", igual que con un correo que no existe | Cualquiera |
| 1.2 | Inicia sesión con la cuenta `admin` | Dashboard con "Hola, <nombre>" y la insignia Administrador | admin |
| 1.3 | Recarga la página (web) o cierra y abre la app | Sigues dentro, sin volver a escribir la contraseña | Cualquiera |
| 1.4 | Web: abre las herramientas del navegador → Application → Cookies de `localhost:3000` | Cookie `tssera_rt` marcada `HttpOnly`; nada en `sessionStorage` | Cualquiera |
| 1.5 | Login → "¿Olvidaste tu contraseña?" → envía tu correo | Pantalla "Revisa tu correo", exista o no la cuenta | Sin sesión |
| 1.6 | Abre el enlace del correo (`/restablecer?token=...`) y recarga la página | La pantalla "Crear contraseña nueva" sigue ahí | Sin sesión |
| 1.7 | Escribe una contraseña de menos de 15 caracteres | "La contraseña debe tener al menos 15 caracteres" | Sin sesión |
| 1.8 | Guarda una contraseña válida y vuelve a usar el mismo enlace | Primero "Listo"; al reusar, "El enlace no es válido o ya venció" | Sin sesión |
| 1.9 | Falla la contraseña 5 veces seguidas | Mensaje de demasiados intentos durante 5 minutos | Cualquiera |
| 1.10 | Perfil → Cerrar sesión | Vuelves al login; la cookie desaparece | Cualquiera |

### Bloque 2: construcción y vistas por rol

| # | Qué hacer | Qué debes ver | Rol |
|---|---|---|---|
| 2.1 | Abre el Dashboard | KPIs, "Requiere tu atención" y el botón "Nueva propuesta" | admin |
| 2.2 | Abre el Dashboard | KPIs y obras en curso; sin "Requiere tu atención" ni "Nueva propuesta" | user |
| 2.3 | Obras → Torre Cedro | "Retraso de N días"; el estado sigue siendo "En progreso" | Cualquiera |
| 2.4 | Abre el detalle de una obra | Montos en pesos (`$38,600,000.00`) y movimientos con folio `MOV-…` | admin |
| 2.5 | Abre la misma obra | Solo porcentajes; ningún monto | user |
| 2.6 | Propuestas → una "En revisión" → Aprobar | Pasa a Aprobada y aparece una obra nueva `OBR-…` en Planeación | admin |
| 2.7 | Propuestas → otra en revisión → Rechazar sin motivo | No deja; con motivo, pasa a Rechazada | admin |
| 2.8 | En una obra, registra un ajuste de presupuesto | Movimiento nuevo; cambian el presupuesto y el % ejercido | admin |
| 2.9 | Corrige ese ajuste e intenta corregirlo otra vez | Aparece el movimiento contrario; la segunda vez no se permite | admin |
| 2.10 | Avanza la obra de estado | Solo deja Planeación → En progreso → Certificando → Completada | admin |
| 2.11 | Archiva una obra | Sale de la lista activa y aparece en el filtro "Archivadas" | admin |
| 2.12 | Elimina una obra que ya tiene ajustes | No deja: tiene movimientos | admin |
| 2.13 | Marca un requisito de certificación | Cambia su estado y queda en la actividad de la obra | admin |
| 2.14 | Abre la actividad de una obra | Quién, qué y cuándo; sin montos | Cualquiera |

### Bloque 3: propuestas, usuarios, perfil y papelera

| # | Qué hacer | Qué debes ver | Rol |
|---|---|---|---|
| 3.1 | Nueva propuesta → escribe solo el nombre → guarda | Borrador con folio `PRO-…` | admin |
| 3.2 | Envía ese borrador a revisión | Errores junto a cada campo que falta | admin |
| 3.3 | Completa los 4 pasos y envía | Pasa a "En revisión" y ya no se puede editar | admin |
| 3.4 | Elimina un borrador → Perfil → Papelera → Restaurar | Vuelve como borrador | admin |
| 3.5 | Perfil → Usuarios → Invitar (correo, nombre, rol) | Usuario "Invitado". Con Resend, llega el correo con la marca | admin |
| 3.6 | Abre el enlace de la invitación (`/activar?token=...`) y crea la contraseña | "Tu cuenta está activa"; ya puedes entrar con esa cuenta | Invitado |
| 3.7 | Cambia el rol del único administrador o desactívalo | No deja: es el último administrador | admin |
| 3.8 | Desactiva un usuario que tiene la sesión abierta | Ese usuario vuelve al login en su siguiente acción | admin |
| 3.9 | Perfil → Editar nombre | El saludo del Dashboard cambia | Cualquiera |
| 3.10 | Perfil → Cambiar contraseña con la actual equivocada | Error; con la correcta se guarda y esta sesión sigue abierta | Cualquiera |
| 3.11 | Abre Perfil | No aparecen Usuarios ni Papelera | user |
| 3.12 | Apaga el Wi-Fi del dispositivo | Banner "Sin conexión"; al volver, las listas se recargan | Cualquiera |

Comprobado en Chrome sin interfaz contra la API en memoria: 1.1 a 1.8, 1.10, 2.1 a 2.3, 2.5 y 3.11. El resto lo
cubren las pruebas de la API, pero no se recorrió en pantalla.

## 8. Solución de problemas

| Síntoma | Causa probable | Arreglo |
|---|---|---|
| La web no inicia sesión y la consola del navegador menciona CORS | El origen de la web no está en `CORS_ORIGINS` | Agrégalo sin barra final (incluye `http://<IP>:5173` si entras por IP) y reinicia la API |
| La web te saca al recargar | La cookie no se guardó: web y API en sitios distintos | En local usa el mismo host para ambas (`localhost` o la misma IP) |
| La API no arranca: `MongoServerSelectionError` o `/health` da 503 | Tu IP no está permitida en Atlas | Atlas → Network Access → Add Current IP Address |
| La API se detiene con "Configuración inválida" | Falta una variable | El mensaje dice cuál; complétala en `.env.local` |
| El correo no llega; el log dice `Resend rejected the email (validation_error)` | Con `onboarding@resend.dev` el destinatario no es el dueño de la cuenta | Usa ese correo, o verifica un dominio y cambia `EMAIL_FROM` |
| La invitación responde `emailSent: false` | Falta `RESEND_API_KEY` o Resend rechazó el envío | Corrige y usa "Reenviar invitación" |
| El enlace del correo abre otra web | `APP_WEB_URL` apunta a otro lado | En local: `APP_WEB_URL=http://localhost:5173` |
| El APK dice "No se pudo conectar con el servidor" | IP distinta a la del APK, firewall, o HTTP hacia otro host (Android lo bloquea) | Prueba `http://<IP>:3000/health` en el navegador del teléfono; recompila con la IP correcta |
| La app en desarrollo muestra código viejo o la URL anterior | Caché de Metro | `pnpm --filter @erp/mobile start -- --reset-cache` |
| `EADDRINUSE: address already in use :::3000` | Otro proceso usa el puerto | `Get-NetTCPConnection -LocalPort 3000 \| Select OwningProcess`, luego `Stop-Process -Id <pid>`; o cambia `PORT` |
| "Demasiados intentos" al probar el login muchas veces | Límite de 10 intentos por IP cada 15 minutos | Espera o reinicia la API |
| Gradle falla con "Unsupported class file major version" | Está usando un JDK más nuevo que 17 | Define `JAVA_HOME` con un JDK 17, o `org.gradle.java.home` en `~/.gradle/gradle.properties` |
| `pnpm` no se puede cargar en PowerShell | Política de ejecución de scripts | `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` |

## 9. APK para Android

### Llave de firma (una sola vez)

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\keystores"
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -v -storetype PKCS12 -keystore "$env:USERPROFILE\keystores\tssera-upload.keystore" -alias tssera -keyalg RSA -keysize 2048 -validity 10000
```

Guarda la llave y su contraseña fuera del repo, con respaldo, y llena las cuatro propiedades `TSSERA_UPLOAD_*` de la
sección 3. `.gitignore` excluye `*.keystore` y `*.jks`. Sin esas propiedades, el release se firma con la llave de
depuración: sirve para probar, no para publicar.

### Compilar (ejecutado)

```powershell
cd apps/mobile/android
$env:JAVA_HOME = "<ruta de un JDK 17>"          # solo si tu java por defecto no es 17
$env:TSSERA_API_URL = "http://<IP-de-tu-equipo>:3000"
.\gradlew.bat assembleRelease
```

El archivo queda en `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`.
Al escribir esta guía pesó 24.7 MB (incluye las cuatro arquitecturas) y se comprobó en un emulador: instala, abre e
inicia sesión contra la API del equipo por su IP de red local. No se probó en un teléfono físico.

- La URL queda fija dentro del APK. Si cambia la IP, vuelve a compilar.
- En release Android bloquea HTTP sin cifrar. La compilación genera una configuración de seguridad de red que lo
  permite **solo hacia el host de `TSSERA_API_URL`**; con una URL `https://` no abre ninguna excepción.
- Para un APK más ligero, solo para teléfonos: agrega `-PreactNativeArchitectures=arm64-v8a,armeabi-v7a`.

**Alternativa con HTTPS (no ejecutado aquí):** expón la API con un túnel y compila con su URL. No hace falta estar en
la misma red ni abrir el firewall. Por ejemplo, con Cloudflare Tunnel:

```powershell
cloudflared tunnel --url http://localhost:3000     # imprime una URL https://<algo>.trycloudflare.com
$env:TSSERA_API_URL = "https://<algo>.trycloudflare.com"
.\gradlew.bat assembleRelease
```

### Instalar

**A. Copiando el archivo.** Pasa `app-release.apk` al teléfono (cable, Drive o correo), ábrelo desde la app Archivos y
acepta "Permitir instalar apps desconocidas" para esa app cuando lo pida.

**B. Con `adb`.** En el teléfono: Ajustes → Acerca del teléfono → toca 7 veces "Número de compilación" → Opciones de
desarrollador → Depuración USB. Conéctalo por USB y acepta la huella del equipo.

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r apps\mobile\android\app\build\outputs\apk\release\app-release.apk
```

Si ya tenías instalada una versión firmada con otra llave, desinstálala antes.

### Verificar que la app llega a la API

1. Con la API corriendo, abre `http://<IP>:3000/health` en el navegador del teléfono: debe responder `ok`.
2. Abre T-ssera e inicia sesión con la cuenta de `SEED_ADMIN_*`. Debes ver el Dashboard.
3. En la terminal de la API aparece una línea `POST /login` con estado 200 por cada inicio de sesión.
4. Si la app dice "No se pudo conectar con el servidor", revisa la fila correspondiente de la sección 8.

## 10. Pruebas

```powershell
pnpm build      # typecheck de todo el monorepo y build de API y web (ejecutado)
pnpm lint       # ESLint (ejecutado)
pnpm test       # todas las pruebas de Jest (ejecutado)

# Un solo módulo o archivo (ejecutado)
pnpm --filter @erp/api exec jest src/modules/identity
pnpm --filter @erp/api exec jest src/modules/construction/proposals/proposals.test.ts

# Una sola prueba por nombre (no ejecutado aquí)
pnpm --filter @erp/api exec jest -t "aprobar una propuesta"
```

Las pruebas usan una base MongoDB en memoria: no tocan Atlas ni envían correos.

### Correos

```powershell
pnpm --filter @erp/api email:preview                          # HTML en apps/api/.email-preview (ejecutado)
pnpm --filter @erp/api email:test -- tu-correo@ejemplo.com    # envía los tres correos con Resend (ver sección 2)
```
