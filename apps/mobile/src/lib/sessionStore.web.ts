import {COOKIE_SESSION, type SessionStore} from '@erp/api-client';

/**
 * En la web el refresh token vive en una cookie httpOnly que pone la API: JavaScript nunca lo ve.
 * El access token queda solo en memoria y al recargar se pide uno nuevo con la cookie.
 */
export const cookieSession = true;

// Solo recuerda que hubo un inicio de sesión, para no pedir una renovación que fallaría en cada visita anónima.
const KEY = 'tssera.hasSession';

// Restos de versiones anteriores, que guardaban el refresh token en sessionStorage.
try {
  sessionStorage.removeItem('tssera.refreshToken');
  sessionStorage.removeItem('tssera.session');
} catch {
  // Almacenamiento no disponible.
}

export const sessionStore: SessionStore = {
  async load() {
    try {
      return localStorage.getItem(KEY) ? {refreshToken: COOKIE_SESSION} : null;
    } catch {
      // Sin almacenamiento se intenta igual: la cookie decide.
      return {refreshToken: COOKIE_SESSION};
    }
  },
  async save() {
    localStorage.setItem(KEY, '1');
  },
  async clear() {
    localStorage.removeItem(KEY);
  },
};
