# ADR 0001: Stack y decisiones base

## Estado

Aceptada para la fase 0.

## Decisiones

- El repositorio usa workspaces de pnpm y TypeScript estricto compartido desde la configuración raíz y `packages/config`.
- El cliente comparte código entre React Native y React Native Web; las aplicaciones consumen `packages/api-client`.
- La API usa Node.js y Express, con el flujo route -> controller -> service -> repository reservado para los módulos.
- MongoDB Atlas es la base de datos; la configuración se obtiene exclusivamente de variables de entorno.
- Cada acceso futuro a datos debe estar acotado por `tenantId`; el repositorio base rechaza consultas sin tenant.
- Modelo de documento: en Mongo cada documento de negocio usa `_id` UUID (texto), `tenantId`, `createdAt`/`updatedAt` y `deletedAt` (`null` si está activo) como `Date`. Hacia la API se expone como `id` y fechas ISO 8601 (`BaseDocumentSchema`); la conversión la hace `toApiDocument` en `core/repository.ts`. El borrado es lógico.
- El tenant de una petición sale siempre del access token verificado, nunca de cabeceras enviadas por el cliente.
- Zod valida configuración y será la validación de entrada de cada endpoint.
- Jest y Supertest cubren la API; BullMQ/Redis quedan preparados para fases posteriores.
- El dinero se representa como `Decimal128` en persistencia y como cadena decimal en los tipos compartidos, nunca como `number`.
- Autenticación con JWT: access token corto (`JWT_EXPIRES_IN`) y refresh token rotatorio (`JWT_REFRESH_EXPIRES_IN`) cuyo `jti` se guarda en `refresh_tokens`; reutilizar un refresh token ya rotado revoca todas las sesiones del usuario. Contraseñas con `scrypt` de Node (sin dependencias nativas).
- RBAC por rol en `core/middlewares/permissions.ts` (`requirePermission(módulo, acción)`). El middleware de auditoría sigue siendo un contrato sin implementación.

## Consecuencias

El esqueleto compila y permite validar infraestructura sin introducir lógica de negocio. MongoDB Atlas es un requisito para un estado saludable real y no se simula en producción.
