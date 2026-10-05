// Lo define Vite al compilar a partir de VITE_API_URL (ver apps/web/vite.config.ts).
declare const __ERP_API_URL__: string;

// Sin VITE_API_URL en desarrollo, la API se busca en el mismo equipo que sirve la web (puerto 3000): así funciona
// igual desde `localhost` que desde otro dispositivo de la red, y la cookie de sesión queda en el mismo sitio.
export const API_URL = __ERP_API_URL__ || `${window.location.protocol}//${window.location.hostname}:3000`;
