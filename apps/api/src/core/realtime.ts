import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import jwt from 'jsonwebtoken';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import type { RealtimeEvent } from '@erp/domain';
import type { ServerConfig } from '@erp/config';
import { logger } from '../config/logger';
import { verifyAccessToken } from '../modules/identity/tokens';

export const REALTIME_PATH = '/ws';
const AUTH_TIMEOUT_MS = 10_000;
const HEARTBEAT_MS = 30_000;
// Códigos de cierre propios (rango 4000-4999). 4401: el cliente debe renovar su token y reconectar.
export const CLOSE_UNAUTHORIZED = 4401;

export type RealtimePublisher = (tenantId: string, event: RealtimeEvent) => void;

interface ClientState { tenantId?: string; alive: boolean }

/**
 * Canal de tiempo real por tenant. El cliente abre `wss://.../ws` y su primer mensaje debe ser
 * `{ "type": "auth", "token": "<accessToken>" }` (el token no va en la URL para que no quede en logs).
 * La conexión se cierra con 4401 cuando el token expira; el cliente renueva y vuelve a conectar.
 *
 * Los sockets viven en memoria: con más de una instancia de la API haría falta un pub/sub (Redis).
 */
export class RealtimeHub {
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });
  private readonly clients = new Map<WebSocket, ClientState>();
  private readonly heartbeat: NodeJS.Timeout;

  public constructor(private readonly config: ServerConfig) {
    this.wss.on('connection', (socket) => this.onConnection(socket));
    this.heartbeat = setInterval(() => this.checkAlive(), HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  attach(server: Server): void {
    server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      if (new URL(request.url ?? '/', 'http://localhost').pathname !== REALTIME_PATH) {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(request, socket, head, (ws) => this.wss.emit('connection', ws, request));
    });
  }

  publish: RealtimePublisher = (tenantId, event) => {
    const payload = JSON.stringify(event);
    for (const [socket, state] of this.clients) {
      if (state.tenantId === tenantId && socket.readyState === socket.OPEN) socket.send(payload);
    }
  };

  connectionCount(): number {
    return [...this.clients.values()].filter((state) => state.tenantId).length;
  }

  close(): void {
    clearInterval(this.heartbeat);
    for (const socket of this.clients.keys()) socket.terminate();
    this.wss.close();
  }

  private onConnection(socket: WebSocket): void {
    const state: ClientState = { alive: true };
    this.clients.set(socket, state);
    const authTimer = setTimeout(() => socket.close(CLOSE_UNAUTHORIZED, 'Authentication timeout'), AUTH_TIMEOUT_MS);

    socket.on('pong', () => { state.alive = true; });
    socket.on('close', () => {
      clearTimeout(authTimer);
      this.clients.delete(socket);
    });
    socket.on('message', (data: RawData) => {
      if (state.tenantId) return; // tras autenticar el canal es solo de servidor a cliente
      clearTimeout(authTimer);
      this.authenticate(socket, state, data);
    });
  }

  private authenticate(socket: WebSocket, state: ClientState, data: RawData): void {
    try {
      const message = JSON.parse(data.toString()) as { type?: string; token?: string };
      if (message.type !== 'auth' || typeof message.token !== 'string') throw new Error('Expected auth message');
      const claims = verifyAccessToken(message.token, this.config);
      state.tenantId = claims.tenantId;

      const { exp } = jwt.decode(message.token) as jwt.JwtPayload;
      const msToExpiry = (exp as number) * 1000 - Date.now();
      const expiryTimer = setTimeout(() => socket.close(CLOSE_UNAUTHORIZED, 'Token expired'), msToExpiry);
      socket.on('close', () => clearTimeout(expiryTimer));

      socket.send(JSON.stringify({ type: 'ready' }));
    } catch (error) {
      logger.info('Realtime auth rejected', { reason: error instanceof Error ? error.message : String(error) });
      socket.close(CLOSE_UNAUTHORIZED, 'Invalid token');
    }
  }

  private checkAlive(): void {
    for (const [socket, state] of this.clients) {
      if (!state.alive) {
        socket.terminate();
        continue;
      }
      state.alive = false;
      socket.ping();
    }
  }
}
