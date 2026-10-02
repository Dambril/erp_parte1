import { ApiClient, type SessionStore } from '@erp/api-client';

// VITE_API_URL permite apuntar a otra API (p. ej. en Cloudflare Pages); si falta, local en
// desarrollo y Render en producción.
const API_URL =
  import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://erp-api-305o.onrender.com' : 'http://localhost:3000');

// Solo el refresh token se guarda, en sessionStorage: muere al cerrar la pestaña, lo que acota el daño si
// un script ajeno llegara a leerlo. El access token vive solo en memoria y al recargar se obtiene uno nuevo.
// Las cookies httpOnly no sirven porque la API está en otro dominio (los navegadores bloquean cookies de terceros).
const KEY = 'tssera.refreshToken';
const sessionStore: SessionStore = {
  async load() {
    try {
      const refreshToken = sessionStorage.getItem(KEY);
      return refreshToken ? { refreshToken } : null;
    } catch {
      return null;
    }
  },
  async save({ refreshToken }) {
    sessionStorage.setItem(KEY, refreshToken);
  },
  async clear() {
    sessionStorage.removeItem(KEY);
  },
};

// Sesión del formato anterior (ambos tokens juntos): ya no sirve con la API actual.
try {
  sessionStorage.removeItem('tssera.session');
} catch {
  // Almacenamiento no disponible.
}

export const apiClient = new ApiClient({ baseUrl: API_URL, sessionStore });
