import fetch from 'cross-fetch';
import type {
  CatalogResource, CatalogResources, CreateLotRequest, CreateMovementRequest, CreateTransferRequest, InventoryMovement,
  InventorySettings, Kardex, KardexQuery, Lot, Paginated, ReconciliationReport, StockLevel, StockQuery, TransferResult,
} from '@erp/domain';

const DEFAULT_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

export interface ApiClientOptions {
  baseUrl?: string;
  /** Access token (JWT). El tenant lo determina el token en el servidor; no se envía por separado. */
  accessToken?: string;
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
type QueryValue = string | number | undefined;

export interface ListQuery {
  page?: number;
  pageSize?: number;
  q?: string;
}

function queryString(query: object = {}): string {
  const params = Object.entries(query as Record<string, QueryValue>)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return params.length ? `?${params.join('&')}` : '';
}

export class ApiClient {
  private baseUrl: string;
  private accessToken?: string;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl || DEFAULT_BASE_URL;
    this.accessToken = options.accessToken;
  }

  setAccessToken(token: string | undefined): void {
    this.accessToken = token;
  }

  private async request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new ApiError(
        response.status,
        errorBody.error?.message || 'Request failed',
        errorBody.error?.code || 'UNKNOWN_ERROR'
      );
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  /** Respuesta completa (`{ success, data, timestamp }`). */
  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body ?? {});
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async delete<T = void>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  /** Solo el `data` de la respuesta estándar. */
  private async data<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
    return (await this.request<{ data: T }>(method, path, body)).data;
  }

  readonly catalogs = {
    list: <R extends CatalogResource>(resource: R, query?: ListQuery) =>
      this.data<Paginated<CatalogResources[R]['record']>>('GET', `/catalogs/${resource}${queryString(query)}`),
    get: <R extends CatalogResource>(resource: R, id: string) =>
      this.data<CatalogResources[R]['record']>('GET', `/catalogs/${resource}/${id}`),
    create: <R extends CatalogResource>(resource: R, input: CatalogResources[R]['input']) =>
      this.data<CatalogResources[R]['record']>('POST', `/catalogs/${resource}`, input),
    update: <R extends CatalogResource>(resource: R, id: string, changes: Partial<CatalogResources[R]['input']>) =>
      this.data<CatalogResources[R]['record']>('PATCH', `/catalogs/${resource}/${id}`, changes),
    remove: (resource: CatalogResource, id: string) => this.request<void>('DELETE', `/catalogs/${resource}/${id}`),
  };

  readonly inventory = {
    recordMovement: (input: CreateMovementRequest) => this.data<InventoryMovement>('POST', '/inventory/movements', input),
    getMovement: (id: string) => this.data<InventoryMovement>('GET', `/inventory/movements/${id}`),
    reverseMovement: (id: string, reason?: string) =>
      this.data<InventoryMovement[]>('POST', `/inventory/movements/${id}/reverse`, reason ? { reason } : {}),
    transfer: (input: CreateTransferRequest) => this.data<TransferResult>('POST', '/inventory/transfers', input),
    stock: (query?: StockQuery) => this.data<Paginated<StockLevel>>('GET', `/inventory/stock${queryString(query)}`),
    kardex: (productId: string, query?: KardexQuery) =>
      this.data<Kardex>('GET', `/inventory/kardex/${productId}${queryString(query)}`),
    lots: (productId: string, query?: Omit<ListQuery, 'q'>) =>
      this.data<Paginated<Lot>>('GET', `/inventory/lots${queryString({ ...query, productId })}`),
    createLot: (input: CreateLotRequest) => this.data<Lot>('POST', '/inventory/lots', input),
    settings: () => this.data<InventorySettings>('GET', '/inventory/settings'),
    updateSettings: (settings: InventorySettings) => this.data<InventorySettings>('PUT', '/inventory/settings', settings),
    reconciliation: () => this.data<ReconciliationReport>('GET', '/inventory/reconciliation'),
  };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
