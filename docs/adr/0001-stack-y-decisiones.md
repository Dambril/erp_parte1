# ADR 0001: Stack y decisiones base

## Estado

Aceptada para la fase 0.

## Decisiones

- El repositorio usa workspaces de pnpm y TypeScript estricto compartido desde la configuración raíz y `packages/config`.
- El cliente comparte código entre React Native y React Native Web; las aplicaciones consumen `packages/api-client`.
- La API usa Node.js y Express, con el flujo route -> controller -> service -> repository reservado para los módulos.
- MongoDB Atlas es la base de datos; la configuración se obtiene exclusivamente de variables de entorno.
- Cada acceso futuro a datos debe estar acotado por `tenantId`; el repositorio base rechaza consultas sin tenant.
- Zod valida configuración y será la validación de entrada de cada endpoint.
- Jest y Supertest cubren la API; BullMQ/Redis quedan preparados para fases posteriores.
- El dinero se representa como `Decimal128` en persistencia y como cadena decimal en los tipos compartidos, nunca como `number`.
- Las capas de seguridad (JWT, RBAC, auditoría y tenant) tienen contratos/stubs en esta fase; su lógica funcional se implementará en módulos posteriores.

## Consecuencias

El esqueleto compila y permite validar infraestructura sin introducir lógica de negocio. MongoDB Atlas es un requisito para un estado saludable real y no se simula en producción.
