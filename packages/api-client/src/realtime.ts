import type { RealtimeEvent } from '@erp/domain';
import type { ApiClient } from './index';

export type RealtimeStatus = 'desconectado' | 'conectando' | 'conectado';

export interface RealtimeOptions {
  onEvent: (event: RealtimeEvent) => void;
  onStatus?: (status: RealtimeStatus) => void;
  /** Tras cada (re)conexión: conviene recargar datos por si hubo cambios mientras no había canal. */
  onReady?: () => void;
}

export interface RealtimeConnection { close(): void }

const UNAUTHORIZED = 4401;
const MAX_DELAY_MS = 30_000;

/** Mantiene abierto el canal `/ws` de la API, con reconexión exponencial y renovación de token. */
export function connectRealtime(client: ApiClient, options: RealtimeOptions): RealtimeConnection {
  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let closed = false;

  const setStatus = (status: RealtimeStatus) => options.onStatus?.(status);

  const scheduleReconnect = () => {
    const delay = Math.min(MAX_DELAY_MS, 1000 * 2 ** attempt);
    attempt += 1;
    timer = setTimeout(connect, delay);
  };

  function connect() {
    if (closed) return;
    const token = client.getSession()?.accessToken;
    if (!token) {
      setStatus('desconectado');
      return;
    }
    setStatus('conectando');
    const ws = new WebSocket(client.realtimeUrl());
    socket = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token }));
    ws.onmessage = (message) => {
      const data = JSON.parse(String(message.data)) as RealtimeEvent | { type: 'ready' };
      if (data.type === 'ready') {
        attempt = 0;
        setStatus('conectado');
        options.onReady?.();
      } else {
        options.onEvent(data);
      }
    };
    ws.onclose = (event) => {
      socket = null;
      if (closed) return;
      setStatus('desconectado');
      if (event.code === UNAUTHORIZED) {
        client.refreshSession().then((session) => { if (session) connect(); }, scheduleReconnect);
      } else {
        scheduleReconnect();
      }
    };
  }

  connect();
  return {
    close() {
      closed = true;
      clearTimeout(timer);
      socket?.close();
      setStatus('desconectado');
    },
  };
}
