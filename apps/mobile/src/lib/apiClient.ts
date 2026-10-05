import {ApiClient} from '@erp/api-client';
import {API_URL} from './config';
import {cookieSession, sessionStore} from './sessionStore';

// La URL de la API y dónde se guarda la sesión dependen de la plataforma (`config` y `sessionStore`
// tienen una versión `.web.ts`); el resto de la app solo conoce este cliente.
export const apiClient = new ApiClient({baseUrl: API_URL, sessionStore, cookieSession});
