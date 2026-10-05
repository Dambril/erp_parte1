import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const fromRepo = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const pkg = (name: string) => fromRepo(`packages/${name}/src`);

// Primero las versiones `.web.*`: es lo que separa una implementación de navegador de la nativa
// (almacenamiento de sesión, conexión, selector de fechas) sin tocar las pantallas.
const extensions = ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'];

// La API desplegada; solo se usa en un build de producción que no define VITE_API_URL.
const DEPLOYED_API_URL = 'https://erp-api-305o.onrender.com';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'VITE_');
  const production = mode === 'production';
  const globals = {
    // Vacío en desarrollo: la app busca la API en el mismo equipo que sirve la web (ver config.web.ts).
    __ERP_API_URL__: JSON.stringify(env.VITE_API_URL || (production ? DEPLOYED_API_URL : '')),
    // Globales que React Native y sus librerías dan por hechos.
    __DEV__: JSON.stringify(!production),
    global: 'globalThis',
  };

  return {
    plugins: [react()],
    define: globals,
    resolve: {
      extensions,
      alias: [
        // La web es la misma app de `apps/mobile`, pintada con React Native Web.
        { find: /^react-native$/, replacement: 'react-native-web' },
        // Los paquetes del workspace se publican como TypeScript: se resuelven a su código fuente y Vite los transpila.
        { find: '@erp/api-client', replacement: pkg('api-client') },
        { find: '@erp/domain', replacement: pkg('domain') },
        { find: '@erp/ui', replacement: pkg('ui') },
      ],
    },
    optimizeDeps: {
      esbuildOptions: {
        resolveExtensions: extensions,
        // Algunas librerías de React Native publican JSX en archivos .js y cargan imágenes con require().
        loader: { '.js': 'jsx', '.png': 'dataurl' },
        define: { __DEV__: globals.__DEV__, global: 'globalThis' },
      },
    },
    build: {
      commonjsOptions: { transformMixedEsModules: true, extensions: ['.web.js', '.js', '.cjs'] },
    },
    // El código de la app y las fuentes viven fuera de apps/web. Con cualquier ruta (p. ej. /restablecer)
    // Vite sirve index.html, tanto en `dev` como en `preview`.
    server: { port: 5173, fs: { allow: [fromRepo('')] } },
    preview: { port: 4173 },
  };
});
