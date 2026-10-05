# ADR 0006: Web con React Native Web, sesión por cookie y APK de demostración

## Estado

Aceptada. Sustituye el punto del ADR 0004 que dejaba la web solo con el acceso y resuelve sus pendientes sobre las
pantallas de construcción en la web y las fuentes en la app.

## Contexto

La web era una app React DOM aparte, con solo las pantallas de acceso; lo demás vivía en la app móvil. El stack del
proyecto pide un solo cliente con React Native y React Native Web. Además, la web guardaba el refresh token en
`sessionStorage`, al alcance de cualquier script de la página.

## Decisión

### Una sola app para móvil y web

- `apps/web` no tiene pantallas: `src/main.tsx` monta `apps/mobile/App.tsx` con React Native Web. Vite resuelve
  `react-native` a `react-native-web`, transpila los paquetes del workspace desde su código fuente y prefiere los
  archivos `.web.ts(x)`.
- Lo que solo existe en nativo queda detrás de una interfaz con dos implementaciones:

  | Interfaz | Nativo | Web |
  |---|---|---|
  | `lib/config` (`API_URL`) | variable `TSSERA_API_URL` incrustada al compilar | `VITE_API_URL`, o el mismo equipo que sirve la web |
  | `lib/sessionStore` | Keychain / Keystore | cookie `httpOnly` (ver abajo) |
  | `lib/connectivity` | NetInfo | eventos `online` / `offline` |
  | `components/DateField` | selector nativo | `<input type="date">` |
  | `navigation/linking` | sin enlaces | rutas del navegador |

- Rutas de la web en `navigation/linking.web.ts`. `/restablecer?token=...` y `/activar?token=...` abren
  `NewPasswordScreen`, que existe con y sin sesión. El servidor de desarrollo, `vite preview` y Cloudflare Pages
  (`public/_redirects`) devuelven `index.html` para cualquier ruta.
- Los íconos siguen siendo glifos Unicode: se ven igual en ambas plataformas y no agregan dependencias.
- Fuentes en `packages/ui/assets/fonts` (Space Grotesk e Inter, licencia OFL), una familia por peso (`fontFaces`).
  Android las empaqueta desde ahí (`sourceSets` en `build.gradle`) y la web las declara con `@font-face`.

### Sesión de la web en cookie `httpOnly`

- La web envía `X-Session-Transport: cookie` y `credentials: 'include'`. Con esa cabecera, `login` y `refresh` ponen el
  refresh token en la cookie `tssera_rt` (`HttpOnly`, `Path=/auth`, 30 días) y no lo devuelven en el cuerpo. El access
  token vive solo en memoria.
- Sin la cabecera (apps nativas) nada cambia: el refresh token viaja en el cuerpo y se guarda en el Keystore.
- La cabecera propia sirve de freno a CSRF: un formulario de otro sitio no puede enviarla, y CORS solo deja pasar los
  orígenes de `CORS_ORIGINS` (con `credentials: true`).
- `SameSite=Lax` fuera de producción; en producción, `SameSite=None; Secure`, porque la web y la API están en
  dominios distintos.

### APK de demostración

- La URL de la API no está en el código: `babel.config.js` incrusta `TSSERA_API_URL` al generar el bundle y
  `build.gradle` se niega a compilar un release sin ella.
- `build.gradle` genera la configuración de seguridad de red por variante. En release el tráfico sin cifrar está
  bloqueado; si la URL es `http://`, se permite solo hacia ese host.

## Consecuencias

- En producción la cookie es de terceros (`pages.dev` y `onrender.com`): los navegadores que las bloquean no
  conservarán la sesión al recargar. Se resuelve sirviendo la web y la API bajo un mismo dominio.
- Dos pestañas que renuevan la sesión en el mismo instante pueden chocar: la segunda usaría un refresh token ya
  rotado y la API cerraría todas las sesiones (regla de reuso del ADR 0003). Queda pendiente coordinar las pestañas.
- La web hereda el diseño de teléfono: en pantallas anchas el contenido ocupa todo el ancho. No hay diseño de
  escritorio propio.
- El código React DOM anterior (`apps/web/src/App.tsx`, `pages/`, `components.tsx`, `state.tsx`, `lib/api.ts`,
  `styles.css`) ya no se importa desde `main.tsx`.
- Cambiar la IP del equipo obliga a recompilar el APK. La alternativa es un túnel HTTPS (ver `docs/RUNBOOK.md`).
