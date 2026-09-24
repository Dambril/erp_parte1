FROM node:20-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json apps/api/package.json
COPY packages packages
RUN pnpm install --no-frozen-lockfile
COPY . .
RUN npm run build
CMD ["node", "apps/api/dist/main.js"]
