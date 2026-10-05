import type {
  AcceptInvitationRequest, ActivityEntry, AuthSession, CookieAuthSession, BudgetMovement, CatalogResource, CatalogResources, CertificationRequirement,
  CreateBudgetMovementRequest, CreateLotRequest, CreateMovementRequest, Dashboard, PageQuery, ProjectDetail,
  ProjectDetailWithAmounts, ProjectListItem, ProjectsQuery, ProjectStatus, ProposalDetail, ProposalDetailWithAmounts, ProposalsQuery,
  ProposalSummary, ProposalSummaryWithAmounts, UpdateProjectRequest, UpdateRequirementRequest,
  AssignableRole, ChangePasswordRequest, InviteUserRequest, InviteUserResponse, ProposalDraftRequest, PublicUser, TrashItem,
  TrashQuery, UpdateProposalRequest, UsersQuery,
  CreateTransferRequest, InventoryMovement, InventorySettings, Kardex, KardexQuery, Lot, MeResponse,   Paginated, Permission, ReconciliationReport, ResetPasswordRequest, StockLevel, StockQuery, TransferResult,
  } from '@erp/domain';
import { ApiError, type ApiErrorDetail } from './errors';

export * from './errors';
export * from './realtime';

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

/** `can('construction.proposals:approve')` a partir de la lista de permisos que entrega `/me`. */
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
  /**
   * Solo navegadores: el refresh token viaja en una cookie httpOnly que pone la API y este cliente nunca lo ve.
   * El `sessionStore` solo recuerda si hay sesión (ver `COOKIE_SESSION`).
   */
  cookieSession?: boolean;
}

/** Valor que un `SessionStore` de navegador devuelve como `refreshToken` cuando el real vive en la cookie. */
export const COOKIE_SESSION = 'cookie';

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
  private readonly cookieSession: boolean;
  private accessToken?: string;
  private session: SessionTokens | null = null;
  private currentMe: MeResponse | null = null;
  private refreshing: Promise<SessionTokens | null> | null = null;
  private readonly listeners = new Set<SessionListener>();

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.store = options.sessionStore ?? memorySessionStore();
    this.accessToken = options.accessToken;
    this.cookieSession = options.cookieSession ?? false;
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
    const { accessToken, refreshToken } = await this.send<AuthSession | CookieAuthSession>('POST', '/auth/login', { email, password }, false) as Partial<AuthSession> & CookieAuthSession;
    this.session = { accessToken, refreshToken: refreshToken ?? COOKIE_SESSION };
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

  /** Cambia el nombre propio y avisa a los oyentes con los datos de sesión actualizados. */
  async updateProfile(name: string): Promise<PublicUser> {
    const user = await this.send<PublicUser>('PATCH', '/me', { name });
    if (this.currentMe) {
      this.currentMe = { ...this.currentMe, user };
      for (const listener of this.listeners) listener(this.currentMe);
    }
    return user;
  }

  /** Cierra las demás sesiones de la cuenta; esta sigue abierta. */
  async changePassword(input: ChangePasswordRequest): Promise<void> {
    await this.send('POST', '/me/password', input);
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

  // ── Construcción ────────────────────────────────────────────────
  // Las respuestas traen montos solo si el usuario tiene `construction.budget:read_amounts` (lo decide la API).

  readonly construction = {
    dashboard: () => this.send<Dashboard>('GET', '/construction/dashboard'),
    projects: {
      list: (query?: ProjectsQuery) => this.send<Paginated<ProjectListItem>>('GET', `/construction/projects${queryString(query)}`),
      get: (id: string) => this.send<ProjectDetail | ProjectDetailWithAmounts>('GET', `/construction/projects/${id}`),
      update: (id: string, changes: UpdateProjectRequest) =>
        this.send<ProjectDetail | ProjectDetailWithAmounts>('PATCH', `/construction/projects/${id}`, changes),
      transition: (id: string, to: ProjectStatus) =>
        this.send<ProjectDetail | ProjectDetailWithAmounts>('POST', `/construction/projects/${id}/transition`, { to }),
      archive: (id: string) => this.send<ProjectDetail | ProjectDetailWithAmounts>('POST', `/construction/projects/${id}/archive`),
      unarchive: (id: string) => this.send<ProjectDetail | ProjectDetailWithAmounts>('POST', `/construction/projects/${id}/unarchive`),
      remove: (id: string) => this.send<void>('DELETE', `/construction/projects/${id}`),
      restore: (id: string) => this.send<ProjectDetail | ProjectDetailWithAmounts>('POST', `/construction/projects/${id}/restore`),
      activity: (id: string, query?: PageQuery) =>
        this.send<Paginated<ActivityEntry>>('GET', `/construction/projects/${id}/activity${queryString(query)}`),
      movements: (id: string, query?: PageQuery) =>
        this.send<Paginated<BudgetMovement>>('GET', `/construction/projects/${id}/budget-movements${queryString(query)}`),
      /** Registra un ajuste; con `reversesMovementId` es la corrección de otro (monto contrario). */
      adjust: (id: string, input: CreateBudgetMovementRequest) =>
        this.send<BudgetMovement>('POST', `/construction/projects/${id}/budget-movements`, input),
      updateRequirement: (id: string, code: string, input: UpdateRequirementRequest) =>
        this.send<CertificationRequirement>('PATCH', `/construction/projects/${id}/certification/requirements/${encodeURIComponent(code)}`, input),
    },
    proposals: {
      list: (query?: ProposalsQuery) =>
        this.send<Paginated<ProposalSummary | ProposalSummaryWithAmounts>>('GET', `/construction/proposals${queryString(query)}`),
      get: (id: string) => this.send<ProposalDetail | ProposalDetailWithAmounts>('GET', `/construction/proposals/${id}`),
      /** Crea un borrador; solo el nombre es obligatorio. */
      create: (input: ProposalDraftRequest) =>
        this.send<ProposalDetail | ProposalDetailWithAmounts>('POST', '/construction/proposals', input),
      /** Solo en borrador; lo no enviado no cambia. */
      update: (id: string, changes: UpdateProposalRequest) =>
        this.send<ProposalDetail | ProposalDetailWithAmounts>('PATCH', `/construction/proposals/${id}`, changes),
      /** Si falta algo responde `VALIDATION_ERROR` con el detalle por campo (`ApiError.details`). */
      submit: (id: string) => this.send<ProposalDetail | ProposalDetailWithAmounts>('POST', `/construction/proposals/${id}/submit`),
      remove: (id: string) => this.send<void>('DELETE', `/construction/proposals/${id}`),
      restore: (id: string) => this.send<ProposalDetail | ProposalDetailWithAmounts>('POST', `/construction/proposals/${id}/restore`),
      /** Al aprobar se crea la obra: su id viene en `projectId`. */
      approve: (id: string) => this.send<ProposalDetail | ProposalDetailWithAmounts>('POST', `/construction/proposals/${id}/approve`),
      reject: (id: string, reason: string) =>
        this.send<ProposalDetail | ProposalDetailWithAmounts>('POST', `/construction/proposals/${id}/reject`, { reason }),
    },
    /** Obras y propuestas eliminadas que el usuario puede restaurar. */
    trash: (query?: TrashQuery) => this.send<Paginated<TrashItem>>('GET', `/construction/trash${queryString(query)}`),
  };

  // ── Usuarios ────────────────────────────────────────────────────

  readonly users = {
    list: (query?: UsersQuery) => this.send<Paginated<PublicUser>>('GET', `/users${queryString(query)}`),
    /** `emailSent: false` si el correo no salió: la cuenta queda invitada y se puede reenviar. */
    invite: (input: InviteUserRequest) => this.send<InviteUserResponse>('POST', '/users/invitations', input),
    resendInvitation: (id: string) => this.send<InviteUserResponse>('POST', `/users/${id}/invitations/resend`),
    /** `LAST_ADMIN` si es el último administrador activo. */
    changeRole: (id: string, role: AssignableRole) => this.send<PublicUser>('PATCH', `/users/${id}/role`, { role }),
    deactivate: (id: string) => this.send<PublicUser>('POST', `/users/${id}/deactivate`),
    reactivate: (id: string) => this.send<PublicUser>('POST', `/users/${id}/reactivate`),
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
    if (this.cookieSession) headers['X-Session-Transport'] = 'cookie';

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        ...(this.cookieSession ? { credentials: 'include' as const } : {}),
      });
    } catch {
      throw new ApiError(0, 'No se pudo conectar con el servidor', 'NETWORK_ERROR');
    }

    if (response.status === 204) return undefined as T;
    const json = (await response.json().catch(() => ({}))) as { error?: { code?: string; message?: string; details?: ApiErrorDetail[] } };
    if (response.ok) return json as T;

    const code: string = json.error?.code || 'UNKNOWN_ERROR';
    if (auth && response.status === 401 && RENEWABLE_CODES.has(code) && this.session && !retried) {
      if (await this.refreshSession()) return this.request<T>(method, path, body, auth, true);
    }
    throw new ApiError(response.status, json.error?.message || 'Request failed', code, json.error?.details ?? []);
  }

  private async doRefresh(): Promise<SessionTokens | null> {
    const refreshToken = this.session?.refreshToken;
    if (!refreshToken) return null;
    try {
      const { accessToken, refreshToken: next } = await this.send<AuthSession | CookieAuthSession>(
        'POST', '/auth/refresh', this.cookieSession ? {} : { refreshToken }, false,
      ) as Partial<AuthSession> & CookieAuthSession;
      this.session = { accessToken, refreshToken: next ?? COOKIE_SESSION };
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
