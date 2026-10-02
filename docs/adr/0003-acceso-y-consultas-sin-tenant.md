# ADR 0003: Acceso (identity) y consultas sin `tenantId`

## Estado

Aceptada (Bloque 1: acceso).

## Contexto

La regla 2 de `CLAUDE.md` exige que toda consulta vaya acotada por `tenantId`. En el acceso hay operaciones
que ocurren **antes** de saber a qué empresa pertenece la persona: el login y la recuperación de contraseña
solo traen un correo, y la renovación de sesión, el restablecimiento y la invitación solo traen un token.

## Decisión

### Excepción a la regla de tenant

Solo estas consultas pueden ejecutarse sin `tenantId`. Todas viven en `modules/identity/identity.repository.ts`
y su nombre termina en `AcrossTenants` para que se reconozcan en una revisión:

| Método | Operación | Por qué es segura |
|---|---|---|
| `UsersRepository.findByEmailAcrossTenants` | login, `password/forgot` | `email` tiene índice único global (`email_unique`) |
| `SessionsRepository.findByRefreshTokenHashAcrossTenants` | `refresh` | `refreshTokenHash` tiene índice único |
| `AuthTokensRepository.consumeAcrossTenants` | `password/reset`, `invitations/accept` | `tokenHash` tiene índice único |

Condiciones:

- El `tenantId` del documento encontrado es el que se usa en todas las operaciones posteriores, que sí van acotadas.
- Nunca se acepta un tenant enviado por el cliente.
- Ningún otro repositorio ni módulo puede añadir consultas sin tenant; una nueva excepción requiere un ADR.

### Colecciones

Todas llevan `tenantId`, `custom`, `createdAt` y `updatedAt`.

- `users`: añade `status` (`active` | `invited` | `deactivated`), `failedLoginCount`, `lockedUntil` y `custom`.
  `passwordHash` es `null` mientras la cuenta está invitada. Los usuarios anteriores se migran al arrancar
  (`migrateIdentityDocuments`, idempotente) como `active`.
- `sessions`: una por refresh token emitido. Guarda solo el SHA-256 del token (`refreshTokenHash`, único), `expiresAt` (30 días, con TTL),
  `revokedAt` y `revokedReason`. Índice `{ tenantId, userId }`.
- `authTokens`: tokens de un solo uso (`password_reset`, 60 minutos; `invitation`, 7 días). Guarda solo `tokenHash` (único), con TTL sobre `expiresAt`.
- `tenants`: empresa, con `_id` igual a su `tenantId` y `name`. La crea el seed. `/me` la devuelve como `company`;
  si un tenant aún no tiene registro, se muestra su identificador.

`refresh_tokens` y `password_resets` (modelo anterior) quedan sin uso; su TTL las vacía solas.

### Tokens y sesión

- Access token JWT de 15 minutos con `sub`, `tenantId`, `role` y `sid` (sesión que lo emitió). El middleware de tenant toma el `tenantId` de ahí.
- El refresh token es aleatorio (32 bytes), no un JWT, y se rota en cada uso: la sesión usada se revoca (`rotated`) y se crea otra.
- Reutilizar un refresh token **rotado** se trata como robo y revoca todas las sesiones del usuario (`REFRESH_TOKEN_REUSED`).
  Uno cerrado por logout o por cambio de contraseña solo responde `INVALID_REFRESH_TOKEN`.
- `POST /auth/logout` revoca la sesión `sid` del access token.

### Contraseñas e intentos

- Se mantiene `scrypt` de Node (ADR 0001, sin dependencias nativas) en lugar de argon2id.
- Política: de 15 a 128 caracteres, sin reglas de composición (`PasswordSchema` en `packages/domain`).
- Correo inexistente, contraseña incorrecta y cuenta no activa responden igual: 401 `INVALID_CREDENTIALS`.
- Tras 5 fallos seguidos la cuenta se bloquea 5 minutos (429 `TOO_MANY_ATTEMPTS`); un login correcto reinicia el contador.
  Solo cuentan los fallos de cuentas activas. Además sigue el límite por IP (10 cada 15 minutos, `TOO_MANY_REQUESTS`).

### Restablecer e invitar

El consumo del token, el cambio de contraseña (y de estado), la revocación de sesiones y el registro en `audit_logs`
(`password_reset` / `invitation_accepted`) van en una sola transacción con reintento: si algo falla, el token sigue sin usar.

## Consecuencias

- Al desplegar, todas las sesiones anteriores dejan de valer: cada persona inicia sesión una vez más.
- El 429 por bloqueo revela que la cuenta existe y está activa (lo exige la especificación); el límite por IP acota el sondeo.
- `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN` y `PASSWORD_RESET_URL` ya no se usan. `APP_WEB_URL` es obligatoria en producción.
