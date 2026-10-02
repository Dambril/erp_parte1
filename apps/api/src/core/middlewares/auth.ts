import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '@erp/domain';
import type { ServerConfig } from '@erp/config';
import { HttpError } from '../http-error';
import { getDatabase } from '../../config/database';
import { resolveAccess } from '../../modules/identity/access';
import { verifyAccessToken, type AccessTokenClaims } from '../../modules/identity/tokens';

export interface RequestUser {
  id: string;
  tenantId: string;
  role: Role;
  /** Sesión que emitió el access token (`sid`). */
  sessionId: string;
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
 * Un token bien firmado tampoco vale si su sesión se revocó o la cuenta dejó de estar activa (`resolveAccess`).
 */
export function authMiddleware(config: ServerConfig): RequestHandler {
  const invalid = () => new HttpError(401, 'INVALID_TOKEN', 'Invalid or expired access token');
  return (request, _response, next) => {
    const header = request.header('Authorization');
    if (!header) return next();

    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return next(new HttpError(401, 'INVALID_TOKEN', 'Authorization header must be "Bearer <token>"'));
    }
    let claims: AccessTokenClaims;
    try {
      claims = verifyAccessToken(token, config);
    } catch {
      return next(invalid());
    }
    resolveAccess(getDatabase(), claims).then((user) => {
      if (!user) return next(invalid());
      request.user = user;
      next();
    }, next);
  };
}

export function requireAuth(request: Request, _response: Response, next: NextFunction): void {
  if (!request.user) return next(new HttpError(401, 'UNAUTHENTICATED', 'Authentication required'));
  next();
}
