import type { CookieOptions, Request, Response } from 'express';
import type { ServerConfig } from '@erp/config';
import { REFRESH_TOKEN_DAYS } from './identity.service';

/**
 * La web pide que el refresh token viaje en una cookie `httpOnly` (fuera del alcance de JavaScript) con esta
 * cabecera. Al ser una cabecera propia, un formulario de otro sitio no puede enviarla: sirve además de freno a CSRF.
 * Las apps nativas no la mandan y siguen recibiendo el refresh token en el cuerpo.
 */
export const SESSION_TRANSPORT_HEADER = 'X-Session-Transport';
export const REFRESH_COOKIE = 'tssera_rt';

export function usesSessionCookie(request: Request): boolean {
  return request.header(SESSION_TRANSPORT_HEADER) === 'cookie';
}

function cookieOptions(config: ServerConfig): CookieOptions {
  // En producción la web y la API viven en dominios distintos: la cookie debe ser `SameSite=None; Secure`.
  // En local (HTTP, mismo host y distinto puerto) basta `Lax`.
  const production = config.nodeEnv === 'production';
  // Solo las rutas /auth la reciben (refresh y logout); ninguna otra petición la lleva.
  return { httpOnly: true, secure: production, sameSite: production ? 'none' : 'lax', path: '/auth' };
}

export function setRefreshCookie(response: Response, refreshToken: string, config: ServerConfig): void {
  response.cookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions(config), maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000 });
}

export function clearRefreshCookie(response: Response, config: ServerConfig): void {
  response.clearCookie(REFRESH_COOKIE, cookieOptions(config));
}

export function readRefreshCookie(request: Request): string | undefined {
  for (const pair of (request.headers.cookie ?? '').split(';')) {
    const separator = pair.indexOf('=');
    if (separator > 0 && pair.slice(0, separator).trim() === REFRESH_COOKIE) {
      return decodeURIComponent(pair.slice(separator + 1).trim()) || undefined;
    }
  }
  return undefined;
}
