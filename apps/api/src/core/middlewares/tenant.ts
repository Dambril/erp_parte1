import type { NextFunction, Request, Response } from 'express';

export interface TenantContext {
  tenantId: string;
}

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
      user?: { id: string; roles: string[] };
    }
  }
}

export function tenantMiddleware(request: Request, _response: Response, next: NextFunction): void {
  const tenantId = request.header('X-Tenant-Id');
  if (tenantId) request.tenant = { tenantId };
  next();
}
