import type {
  AuthSession, CreateObraInput, MedicionInput, Obra, ObrasQuery, PublicUser, ResumenObras, UpdateObraInput,
} from '@erp/domain';
import { ApiError } from './errors';

export * from './errors';
export * from './realtime';
export * from './obras-store';

/** Dónde persiste cada plataforma la sesión (Keychain en Android, sessionStorage en web). */
export interface SessionStore {
  load(): Promise<AuthSession | null>;
  save(session: AuthSession): Promise<void>;
  clear(): Promise<void>;
}

export function memorySessionStore(): SessionStore {
  let current: AuthSession | null = null;
  return {
    load: async () => current,
    save: async (session) => { current = session; },
    clear: async () => { current = null; },
  };
}

export interface ApiClientOptions {
  baseUrl?: string;
  sessionStore?: SessionStore;
}

type SessionListener = (session: AuthSession | null) => void;
type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

const DEFAULT_BASE_URL = 'http://localhost:3000';
// Códigos con los que la API indica que el access token ya no sirve y conviene renovarlo.
const RENEWABLE_CODES = new Set(['INVALID_TOKEN', 'UNAUTHENTICATED']);

export class ApiClient {
  readonly baseUrl: string;
  private readonly store: SessionStore;
  private session: AuthSession | null = null;
  private refreshing: Promise<AuthSession | null> | null = null;
  private readonly listeners = new Set<SessionListener>();

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.store = options.sessionStore ?? memorySessionStore();
  }

  // ── Sesión ──────────────────────────────────────────────────────

  getSession(): AuthSession | null {
    return this.session;
  }

  /** Avisa cada vez que la sesión cambia; con `null` la app debe volver al login. */
  onSessionChange(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async restoreSession(): Promise<AuthSession | null> {
    this.session = await this.store.load().catch(() => null);
    return this.session;
  }

  async login(email: string, password: string): Promise<AuthSession> {
    const session = await this.send<AuthSession>('POST', '/auth/login', { email, password }, false);
    await this.setSession(session);
    return session;
  }

  async logout(): Promise<void> {
    const refreshToken = this.session?.refreshToken;
    await this.setSession(null);
    if (refreshToken) await this.send('POST', '/auth/logout', { refreshToken }, false).catch(() => undefined);
  }

  me(): Promise<PublicUser> {
    return this.send('GET', '/auth/me');
  }

  /**
   * Renueva el par de tokens. Varias llamadas simultáneas comparten la misma petición, porque
   * el refresh token es de un solo uso. Devuelve null (y cierra la sesión) si ya no es válido.
   */
  refreshSession(): Promise<AuthSession | null> {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => { this.refreshing = null; });
    }
    return this.refreshing;
  }

  realtimeUrl(): string {
    return `${this.baseUrl.replace(/^http/, 'ws')}/ws`;
  }

  // ── Obras ───────────────────────────────────────────────────────

  readonly obras = {
    list: (query: ObrasQuery = {}) => {
      const params = Object.entries(query).filter(([, value]) => value).map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
      return this.send<Obra[]>('GET', `/obras${params.length ? `?${params.join('&')}` : ''}`);
    },
    resumen: () => this.send<ResumenObras>('GET', '/obras/resumen'),
    get: (id: string) => this.send<Obra>('GET', `/obras/${encodeURIComponent(id)}`),
    create: (input: CreateObraInput) => this.send<Obra>('POST', '/obras', input),
    update: (id: string, input: UpdateObraInput) => this.send<Obra>('PATCH', `/obras/${encodeURIComponent(id)}`, input),
    remove: (id: string) => this.send<void>('DELETE', `/obras/${encodeURIComponent(id)}`),
    aprobar: (id: string, comentario?: string) => this.send<Obra>('POST', `/obras/${encodeURIComponent(id)}/aprobar`, { comentario }),
    solicitarCambios: (id: string, comentario: string) =>
      this.send<Obra>('POST', `/obras/${encodeURIComponent(id)}/solicitar-cambios`, { comentario }),
    registrarMedicion: (id: string, input: MedicionInput) => this.send<Obra>('POST', `/obras/${encodeURIComponent(id)}/mediciones`, input),
  };

  // ── HTTP ────────────────────────────────────────────────────────

  /** Respuesta JSON completa (sin desempaquetar `data`). */
  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path, undefined, true);
  }

  private async send<T>(method: Method, path: string, body?: unknown, auth = true): Promise<T> {
    const response = await this.request<{ data: T } | undefined>(method, path, body, auth);
    return response?.data as T;
  }

  private async request<T>(method: Method, path: string, body: unknown, auth: boolean, retried = false): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && this.session) headers.Authorization = `Bearer ${this.session.accessToken}`;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiError(0, 'No se pudo conectar con el servidor', 'NETWORK_ERROR');
    }

    if (response.status === 204) return undefined as T;
    const json = await response.json().catch(() => ({}));
    if (response.ok) return json as T;

    const code: string = json.error?.code || 'UNKNOWN_ERROR';
    if (auth && response.status === 401 && RENEWABLE_CODES.has(code) && this.session && !retried) {
      if (await this.refreshSession()) return this.request<T>(method, path, body, auth, true);
    }
    throw new ApiError(response.status, json.error?.message || 'Request failed', code);
  }

  private async doRefresh(): Promise<AuthSession | null> {
    const refreshToken = this.session?.refreshToken;
    if (!refreshToken) return null;
    try {
      const session = await this.send<AuthSession>('POST', '/auth/refresh', { refreshToken }, false);
      await this.setSession(session);
      return session;
    } catch (error) {
      // Sin red no se pierde la sesión: se reintentará más tarde.
      if (error instanceof ApiError && error.code === 'NETWORK_ERROR') throw error;
      await this.setSession(null);
      return null;
    }
  }

  private async setSession(session: AuthSession | null): Promise<void> {
    this.session = session;
    await (session ? this.store.save(session) : this.store.clear()).catch(() => undefined);
    for (const listener of this.listeners) listener(session);
  }
}
