import { ApiClient, ObrasStore, type SessionStore } from '@erp/api-client';
import type { AuthSession } from '@erp/domain';

// VITE_API_URL permite apuntar a otra API (p. ej. en Cloudflare Pages); si falta, local en
// desarrollo y Render en producción.
const API_URL =
  import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://erp-api-305o.onrender.com' : 'http://localhost:3000');

// sessionStorage y no localStorage: la sesión muere al cerrar la pestaña, lo que acota el daño si
// un script ajeno llegara a leerla. Las cookies httpOnly no sirven porque la API está en otro dominio.
const KEY = 'tssera.session';
const sessionStore: SessionStore = {
  async load() {
    try {
      const raw = sessionStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as AuthSession) : null;
    } catch {
      return null;
    }
  },
  async save(session) {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  },
  async clear() {
    sessionStorage.removeItem(KEY);
  },
};

export const apiClient = new ApiClient({ baseUrl: API_URL, sessionStore });
export const obrasStore = new ObrasStore(apiClient);
