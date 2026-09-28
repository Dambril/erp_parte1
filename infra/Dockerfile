# Construir desde la raíz del repo: docker build -f infra/Dockerfile .

# ── Etapa 1: instalar, compilar y aislar dependencias de producción ──
FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY . .
# Solo la API y los paquetes de los que depende (evita instalar React Native).
RUN pnpm install --frozen-lockfile --filter @erp/api...
RUN pnpm --filter @erp/api run build
# node_modules solo con dependencias de producción de la API. Con el node-linker=hoisted
# del .npmrc (necesario para React Native) pnpm 9 genera un deploy vacío; aquí se fuerza isolated.
RUN pnpm --filter @erp/api deploy --prod --config.node-linker=isolated /out

# ── Etapa 2: imagen final mínima ──
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "--enable-source-maps", "dist/main.js"]
