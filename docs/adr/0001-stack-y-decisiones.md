# ADR 0001: Stack y decisiones base

## Estado

Aceptada para la fase 0. Lo relativo al módulo `obras`, su bitácora `audit_log` y `ObrasStore` quedó sustituido por el [ADR 0004](0004-modulo-construccion.md).

## Decisiones

- El repositorio usa workspaces de pnpm y TypeScript estricto compartido desde la configuración raíz y `packages/config`.
- La app (React Native) y la web (React DOM + Vite) comparten lógica, no interfaz: esquemas y reglas en `packages/domain`, y sesión, llamadas, canal en tiempo real y `ObrasStore` en `packages/api-client`. Se descartó React Native Web para la web porque el panel de escritorio tiene otra disposición (tablas, formularios largos) y compilar librerías de RN 0.73 en Vite era frágil.
- Tiempo real con WebSocket nativo (`ws` en la API, `WebSocket` del navegador y de React Native): el canal `/ws` se autentica con el access token en el primer mensaje y difunde por tenant cada cambio de una obra. Los sockets viven en memoria (una instancia); con varias haría falta Redis pub/sub.
- La API usa Node.js y Express, con el flujo route -> controller -> service -> repository reservado para los módulos.
- MongoDB Atlas es la base de datos; la configuración se obtiene exclusivamente de variables de entorno.
- Cada acceso futuro a datos debe estar acotado por `tenantId`; el repositorio base rechaza consultas sin tenant.
- Modelo de documento: en Mongo cada documento de negocio usa `_id` UUID (texto), `tenantId`, `createdAt`/`updatedAt` y `deletedAt` (`null` si está activo) como `Date`. Hacia la API se expone como `id` y fechas ISO 8601 (`BaseDocumentSchema`); la conversión la hace `toApiDocument` en `core/repository.ts`. El borrado es lógico.
- El tenant de una petición sale siempre del access token verificado, nunca de cabeceras enviadas por el cliente.
- Zod valida configuración y será la validación de entrada de cada endpoint.
- Jest y Supertest cubren la API; BullMQ/Redis quedan preparados para fases posteriores.
- El dinero se representa como `Decimal128` en persistencia y como cadena decimal en los tipos compartidos, nunca como `number`.
- Autenticación con JWT: access token corto (`JWT_EXPIRES_IN`) y refresh token opaco y rotatorio guardado como hash en `sessions` (detalle en ADR 0003). Contraseñas con `scrypt` de Node (sin dependencias nativas).
- RBAC por rol: el mapa de permisos vive en `packages/domain` (`roleHasPermission`, `permissionsForRole`) para que los clientes oculten lo que el rol no puede hacer (`/me` entrega la lista), y la API lo aplica con `requirePermission(módulo, acción)`. La acción `approve` (aprobar o solicitar cambios) corresponde a gerentes y administradores.
- Auditoría: cada acción sobre una obra se registra en `audit_log` (actor, acción, entidad, detalles, fecha) desde el servicio, que es quien conoce la entidad afectada.
- Obras: la etapa (`propuesta`, `ejecucion`, `certificacion`, `completada`) se persiste y solo la cambian las decisiones; el estado visible (incluido `retrasada`) se deriva del cronograma al leer. El impacto ambiental real es la suma de mediciones registradas, separado del estimado.

## Consecuencias

MongoDB Atlas es un requisito para un estado saludable real y no se simula en producción (los tests usan `mongodb-memory-server`).
