import type { NextFunction, Request, Response } from 'express';

/**
 * El tenant sale SIEMPRE del access token verificado, nunca de una cabecera del cliente:
 * así un usuario no puede leer datos de otra empresa cambiando un header.
 */
export function tenantMiddleware(request: Request, _response: Response, next: NextFunction): void {
  if (request.user) request.tenant = { tenantId: request.user.tenantId };
  next();
}
