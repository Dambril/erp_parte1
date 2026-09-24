# ERP multi-empresa

Esqueleto de la fase 0 para un ERP multi-tenant con TypeScript, Express, MongoDB Atlas, React Native/Web y Redis.

## Requisitos

- Node.js 20 o superior
- pnpm 9
- Docker (opcional, para Redis y la API)
- Una URI de MongoDB Atlas con transacciones habilitadas

## Configuración

```powershell
Copy-Item .env.example .env.local
```

Edita `.env.local` con una URI real de MongoDB Atlas y secretos locales. Los archivos `.env*` con valores reales no deben entrar al repositorio.

## Instalar y verificar

```powershell
corepack enable
corepack prepare pnpm@9 --activate
pnpm install
pnpm lint
pnpm build
pnpm test
```

## Ejecutar la API

```powershell
pnpm dev
```

`GET http://localhost:3000/health` responde el estado de la API y de MongoDB. El endpoint devuelve `503` si la conexión no está activa.

## Desarrollo con Docker

MongoDB no se ejecuta localmente en esta fase: se configura con `MONGODB_URI` para apuntar a Atlas. Redis sí se levanta localmente:

```powershell
docker compose -f infra/docker-compose.yml up --build
```
