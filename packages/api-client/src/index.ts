import fetch from 'cross-fetch';

const DEFAULT_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

export interface ApiClientOptions {
  baseUrl?: string;
  tenantId?: string;
}

export class ApiClient {
  private baseUrl: string;
  private tenantId?: string;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl || DEFAULT_BASE_URL;
    this.tenantId = options.tenantId;
  }

  setTenantId(id: string): void {
    this.tenantId = id;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    };

    if (this.tenantId) {
      headers['X-Tenant-Id'] = this.tenantId;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new ApiError(
        response.status,
        errorBody.error?.message || 'Request failed',
        errorBody.error?.code || 'UNKNOWN_ERROR'
      );
    }

    return response.json() as Promise<T>;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }
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
