import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '@erp/domain';
import type { ServerConfig } from '@erp/config';
import { HttpError } from '../http-error';
import { verifyAccessToken } from '../../modules/identity/tokens';

export interface RequestUser {
  id: string;
  tenantId: string;
  role: Role;
}

export interface TenantContext {
  tenantId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
      tenant?: TenantContext;
    }
  }
}

/**
 * Autentica si llega `Authorization: Bearer <token>`. Sin cabecera la petición sigue como anónima
 * (las rutas protegidas lo exigen con `requireAuth`); con un token inválido responde 401 directamente.
 */
export function authMiddleware(config: ServerConfig): RequestHandler {
  return (request, _response, next) => {
    const header = request.header('Authorization');
    if (!header) return next();

    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return next(new HttpError(401, 'INVALID_TOKEN', 'Authorization header must be "Bearer <token>"'));
    }
    try {
      const claims = verifyAccessToken(token, config);
      request.user = { id: claims.userId, tenantId: claims.tenantId, role: claims.role };
      next();
    } catch {
      next(new HttpError(401, 'INVALID_TOKEN', 'Invalid or expired access token'));
    }
  };
}

export function requireAuth(request: Request, _response: Response, next: NextFunction): void {
  if (!request.user) return next(new HttpError(401, 'UNAUTHENTICATED', 'Authentication required'));
  next();
}
