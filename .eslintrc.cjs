module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  env: { node: true, jest: true, es2022: true },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist', 'node_modules'],
  rules: {
    // Parámetros con prefijo "_" se mantienen por firma (p. ej. el `next` del error handler de Express).
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    // Permite `declare global { namespace Express { ... } }` para extender Request.
    '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
  },
};
