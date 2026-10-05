// URL de la API para este bundle. Se toma del entorno al transpilar y se incrusta como texto: la app no
// tiene `process.env` en tiempo de ejecución, y así la URL no queda escrita en el código fuente.
const apiUrl = (process.env.TSSERA_API_URL || '').trim().replace(/\/+$/, '');

/** Sustituye `process.env.TSSERA_API_URL` por su valor. */
function inlineApiUrl({types: t}) {
  return {
    name: 'inline-tssera-api-url',
    visitor: {
      MemberExpression(path) {
        if (path.matchesPattern('process.env.TSSERA_API_URL')) {
          path.replaceWith(t.stringLiteral(apiUrl));
        }
      },
    },
  };
}

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [inlineApiUrl],
};
