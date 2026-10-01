import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = (name: string) => fileURLToPath(new URL(`../../packages/${name}/src`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Los paquetes del workspace se publican como TypeScript: se resuelven a su código fuente.
  resolve: { alias: { '@erp/api-client': pkg('api-client'), '@erp/domain': pkg('domain') } },
  server: { port: 5173 },
});
