import type {
  AcceptInvitationRequest, AuthSession, CatalogResource, CatalogResources, CreateLotRequest, CreateMovementRequest, CreateObraInput,
  CreateTransferRequest, InventoryMovement, InventorySettings, Kardex, KardexQuery, Lot, MedicionInput, MeResponse, Obra, ObrasQuery,
  Paginated, Permission, ReconciliationReport, ResetPasswordRequest, ResumenObras, StockLevel, StockQuery, TransferResult,
  UpdateObraInput,
} from '@erp/domain';
import { ApiError } from './errors';

export * from './errors';
export * from './realtime';
export * from './obras-store';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

/** Lo que una plataforma recupera al arrancar: el refresh token siempre; el access token solo si decidió guardarlo. */
export interface StoredSession {
  refreshToken: string;
  accessToken?: string;
}

/**
 * Dónde persiste cada plataforma la sesión. Cada una decide qué guarda de `save`:
 * la app, ambos tokens en Keychain/Keystore; la web, solo el refresh token (el access token vive en memoria).
 */
export interface SessionStore {
  load(): Promise<StoredSession | null>;
  save(tokens: SessionTokens): Promise<void>;
  clear(): Promise<void>;
}

export function memorySessionStore(): SessionStore {
  let current: SessionTokens | null = null;
  return {
    load: async () => current,
    save: async (tokens) => { current = tokens; },
    clear: async () => { current = null; },
  };
}

/** `can('obras.approve')` a partir de la lista de permisos que entrega `/me`. */
export function permissionChecker(permissions: readonly Permission[]): (permission: Permission) => boolean {
  const granted = new Set(permissions);
  return (permission) => granted.has(permission);
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

/** Recibe los datos de `/me` con sesión iniciada, o null cuando la sesión termina. */
type SessionListener = (me: MeResponse | null) => void;
type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

const DEFAULT_BASE_URL = 'http://localhost:3000';
// Códigos con los que la API indica que el access token ya no sirve y conviene renovarlo.
const RENEWABLE_CODES = new Set(['INVALID_TOKEN', 'UNAUTHENTICATED']);

export class ApiClient {
  readonly baseUrl: string;
  private readonly store: SessionStore;
  private accessToken?: string;
  private session: SessionTokens | null = null;
  private currentMe: MeResponse | null = null;
  private refreshing: Promise<SessionTokens | null> | null = null;
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

  getSession(): SessionTokens | null {
    return this.session;
  }

  /** Usuario, empresa, rol y permisos de la sesión actual (null sin sesión). */
  getMe(): MeResponse | null {
    return this.currentMe;
  }

  /** Avisa cada vez que la sesión cambia; con `null` la app debe volver al login. */
  onSessionChange(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Recupera la sesión guardada: renueva el par si no hay access token y carga `/me`.
   * Devuelve null si no había sesión o ya no es válida. Sin red lanza `NETWORK_ERROR` y conserva lo guardado.
   */
  async restoreSession(): Promise<MeResponse | null> {
    const stored = await this.store.load().catch(() => null);
    if (!stored?.refreshToken) return null;
    this.session = { accessToken: stored.accessToken ?? '', refreshToken: stored.refreshToken };
    if (!stored.accessToken && !(await this.refreshSession())) return null;
    try {
      return await this.loadMe();
    } catch (error) {
      // loadMe ya cerró la sesión si no era un problema de red.
      if (error instanceof ApiError && error.code === 'NETWORK_ERROR') throw error;
      return null;
    }
  }

  /** Inicia sesión y carga `/me`: los permisos están disponibles antes de avisar a los oyentes. */
  async login(email: string, password: string): Promise<MeResponse> {
    const { accessToken, refreshToken } = await this.send<AuthSession>('POST', '/auth/login', { email, password }, false);
    this.session = { accessToken, refreshToken };
    await this.store.save(this.session).catch(() => undefined);
    return this.loadMe();
  }

  /** Revoca la sesión en la API y borra los tokens locales, aunque la API no responda. */
  async logout(): Promise<void> {
    if (this.session) await this.send('POST', '/auth/logout').catch(() => undefined);
    await this.clearSession();
  }

  me(): Promise<MeResponse> {
    return this.send('GET', '/me');
  }

  /** Responde igual exista o no la cuenta. */
  async forgotPassword(email: string): Promise<void> {
    await this.send('POST', '/auth/password/forgot', { email }, false);
  }

  /** No inicia sesión: después hay que entrar con la contraseña nueva. */
  async resetPassword(input: ResetPasswordRequest): Promise<void> {
    await this.send('POST', '/auth/password/reset', input, false);
  }

  /** Activa una cuenta invitada. No inicia sesión. */
  async acceptInvitation(input: AcceptInvitationRequest): Promise<void> {
    await this.send('POST', '/auth/invitations/accept', input, false);
  }

  /**
   * Renueva el par de tokens. Varias llamadas simultáneas comparten la misma petición, porque
   * el refresh token es de un solo uso. Devuelve null (y cierra la sesión) si ya no es válido.
   */
  refreshSession(): Promise<SessionTokens | null> {
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

  private async doRefresh(): Promise<SessionTokens | null> {
    const refreshToken = this.session?.refreshToken;
    if (!refreshToken) return null;
    try {
      const { accessToken, refreshToken: next } = await this.send<AuthSession>('POST', '/auth/refresh', { refreshToken }, false);
      this.session = { accessToken, refreshToken: next };
      await this.store.save(this.session).catch(() => undefined);
      return this.session;
    } catch (error) {
      // Sin red no se pierde la sesión: se reintentará más tarde.
      if (error instanceof ApiError && error.code === 'NETWORK_ERROR') throw error;
      await this.clearSession();
      return null;
    }
  }

  /** Carga `/me` y avisa a los oyentes. Si falla por algo distinto a la red, la sesión no sirve y se cierra. */
  private async loadMe(): Promise<MeResponse> {
    try {
      this.currentMe = await this.me();
    } catch (error) {
      if (!(error instanceof ApiError && error.code === 'NETWORK_ERROR')) await this.clearSession();
      throw error;
    }
    for (const listener of this.listeners) listener(this.currentMe);
    return this.currentMe;
  }

  private async clearSession(): Promise<void> {
    const hadSession = this.session !== null || this.currentMe !== null;
    this.session = null;
    this.currentMe = null;
    await this.store.clear().catch(() => undefined);
    if (hadSession) for (const listener of this.listeners) listener(null);
  }
}
