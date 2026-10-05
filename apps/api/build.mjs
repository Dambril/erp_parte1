// Empaqueta la API en dist/main.js. Los paquetes del workspace (@erp/*) se publican como
// código TypeScript, así que se incluyen en el bundle; las dependencias de npm quedan
// externas y se resuelven desde node_modules en tiempo de ejecución.
import { cpSync } from 'node:fs';
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  tsconfig: 'tsconfig.json',
  plugins: [
    {
      name: 'externalize-npm-deps',
      setup(pluginBuild) {
        // Todo import "de paquete" (no relativo) que no sea @erp/* se deja externo.
        pluginBuild.onResolve({ filter: /^[^./]/ }, (args) =>
          args.path.startsWith('@erp/') ? undefined : { path: args.path, external: true },
        );
      },
    },
  ],
});

// El logo de los correos se lee del disco en tiempo de ejecución (ver email/templates/logo.ts).
cpSync('src/platform/integrations/email/templates/assets', 'dist/email-assets', { recursive: true });
