import type {
  AuthSession, CatalogResource, CatalogResources, CreateLotRequest, CreateMovementRequest, CreateObraInput, CreateTransferRequest,
  InventoryMovement, InventorySettings, Kardex, KardexQuery, Lot, MedicionInput, Obra, ObrasQuery, Paginated, PublicUser,
  ReconciliationReport, ResumenObras, StockLevel, StockQuery, TransferResult, UpdateObraInput,
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
  /**
   * Access token (JWT) fijo, para scripts y pruebas que ya lo tienen y no usan login/refresh.
   * Si hay sesión iniciada, esta tiene prioridad. El tenant lo determina el token en el servidor.
   */
  accessToken?: string;
}

export interface ListQuery {
  page?: number;
  pageSize?: number;
  q?: string;
}

function queryString(query: object = {}): string {
  const params = Object.entries(query as Record<string, string | number | undefined>)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return params.length ? `?${params.join('&')}` : '';
}

type SessionListener = (session: AuthSession | null) => void;
type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

const DEFAULT_BASE_URL = 'http://localhost:3000';
// Códigos con los que la API indica que el access token ya no sirve y conviene renovarlo.
const RENEWABLE_CODES = new Set(['INVALID_TOKEN', 'UNAUTHENTICATED']);

export class ApiClient {
  readonly baseUrl: string;
  private readonly store: SessionStore;
  private accessToken?: string;
  private session: AuthSession | null = null;
  private refreshing: Promise<AuthSession | null> | null = null;
  private readonly listeners = new Set<SessionListener>();

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.store = options.sessionStore ?? memorySessionStore();
    this.accessToken = options.accessToken;
  }

  /** Cambia el token fijo (ver `ApiClientOptions.accessToken`). */
  setAccessToken(token: string | undefined): void {
    this.accessToken = token;
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

  // ── Catálogos ───────────────────────────────────────────────────

  readonly catalogs = {
    list: <R extends CatalogResource>(resource: R, query?: ListQuery) =>
      this.send<Paginated<CatalogResources[R]['record']>>('GET', `/catalogs/${resource}${queryString(query)}`),
    get: <R extends CatalogResource>(resource: R, id: string) =>
      this.send<CatalogResources[R]['record']>('GET', `/catalogs/${resource}/${id}`),
    create: <R extends CatalogResource>(resource: R, input: CatalogResources[R]['input']) =>
      this.send<CatalogResources[R]['record']>('POST', `/catalogs/${resource}`, input),
    update: <R extends CatalogResource>(resource: R, id: string, changes: Partial<CatalogResources[R]['input']>) =>
      this.send<CatalogResources[R]['record']>('PATCH', `/catalogs/${resource}/${id}`, changes),
    remove: (resource: CatalogResource, id: string) => this.send<void>('DELETE', `/catalogs/${resource}/${id}`),
  };

  // ── Inventario ──────────────────────────────────────────────────

  readonly inventory = {
    recordMovement: (input: CreateMovementRequest) => this.send<InventoryMovement>('POST', '/inventory/movements', input),
    getMovement: (id: string) => this.send<InventoryMovement>('GET', `/inventory/movements/${id}`),
    reverseMovement: (id: string, reason?: string) =>
      this.send<InventoryMovement[]>('POST', `/inventory/movements/${id}/reverse`, reason ? { reason } : {}),
    transfer: (input: CreateTransferRequest) => this.send<TransferResult>('POST', '/inventory/transfers', input),
    stock: (query?: StockQuery) => this.send<Paginated<StockLevel>>('GET', `/inventory/stock${queryString(query)}`),
    kardex: (productId: string, query?: KardexQuery) =>
      this.send<Kardex>('GET', `/inventory/kardex/${productId}${queryString(query)}`),
    lots: (productId: string, query?: Omit<ListQuery, 'q'>) =>
      this.send<Paginated<Lot>>('GET', `/inventory/lots${queryString({ ...query, productId })}`),
    createLot: (input: CreateLotRequest) => this.send<Lot>('POST', '/inventory/lots', input),
    settings: () => this.send<InventorySettings>('GET', '/inventory/settings'),
    updateSettings: (settings: InventorySettings) => this.send<InventorySettings>('PUT', '/inventory/settings', settings),
    reconciliation: () => this.send<ReconciliationReport>('GET', '/inventory/reconciliation'),
  };

  // ── HTTP ────────────────────────────────────────────────────────

  /** Respuesta JSON completa (sin desempaquetar `data`). */
  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path, undefined, true);
  }

  post<T>(path: string, body: unknown = {}): Promise<T> {
    return this.request<T>('POST', path, body, true);
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body, true);
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body, true);
  }

  delete<T = void>(path: string): Promise<T> {
    return this.request<T>('DELETE', path, undefined, true);
  }

  private async send<T>(method: Method, path: string, body?: unknown, auth = true): Promise<T> {
    const response = await this.request<{ data: T } | undefined>(method, path, body, auth);
    return response?.data as T;
  }

  private async request<T>(method: Method, path: string, body: unknown, auth: boolean, retried = false): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = this.session?.accessToken ?? this.accessToken;
    if (auth && token) headers.Authorization = `Bearer ${token}`;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiError(0, 'No se pudo conectar con el servidor', 'NETWORK_ERROR');
    }

    if (response.status === 204) return undefined as T;
    const json = (await response.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
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
