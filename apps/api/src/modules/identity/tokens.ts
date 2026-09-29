import jwt from 'jsonwebtoken';
import { RoleSchema, type Role } from '@erp/domain';
import type { ServerConfig } from '@erp/config';

const ISSUER = 'erp-api';
const ACCESS_AUDIENCE = 'erp-access';
const REFRESH_AUDIENCE = 'erp-refresh';

type ExpiresIn = NonNullable<jwt.SignOptions['expiresIn']>;

export interface AccessTokenClaims {
  userId: string;
  tenantId: string;
  role: Role;
}

export interface RefreshTokenClaims {
  tokenId: string;
  userId: string;
  tenantId: string;
  expiresAt: Date;
}

export function signAccessToken(claims: AccessTokenClaims, config: ServerConfig): string {
  return jwt.sign({ tid: claims.tenantId, role: claims.role }, config.jwtSecret, {
    algorithm: 'HS256',
    subject: claims.userId,
    issuer: ISSUER,
    audience: ACCESS_AUDIENCE,
    expiresIn: config.jwtExpiresIn as ExpiresIn,
  });
}

/** Lanza si el token es inválido, expiró o no es un access token de esta API. */
export function verifyAccessToken(token: string, config: ServerConfig): AccessTokenClaims {
  const payload = jwt.verify(token, config.jwtSecret, {
    algorithms: ['HS256'], issuer: ISSUER, audience: ACCESS_AUDIENCE,
  }) as jwt.JwtPayload;
  if (typeof payload.sub !== 'string' || typeof payload.tid !== 'string') throw new Error('Malformed access token');
  return { userId: payload.sub, tenantId: payload.tid, role: RoleSchema.parse(payload.role) };
}

export function signRefreshToken(
  claims: Omit<RefreshTokenClaims, 'expiresAt'>,
  config: ServerConfig,
): { token: string; expiresAt: Date } {
  const token = jwt.sign({ tid: claims.tenantId }, config.jwtRefreshSecret, {
    algorithm: 'HS256',
    subject: claims.userId,
    jwtid: claims.tokenId,
    issuer: ISSUER,
    audience: REFRESH_AUDIENCE,
    expiresIn: config.jwtRefreshExpiresIn as ExpiresIn,
  });
  const { exp } = jwt.decode(token) as jwt.JwtPayload;
  return { token, expiresAt: new Date((exp as number) * 1000) };
}

export function verifyRefreshToken(token: string, config: ServerConfig): RefreshTokenClaims {
  const payload = jwt.verify(token, config.jwtRefreshSecret, {
    algorithms: ['HS256'], issuer: ISSUER, audience: REFRESH_AUDIENCE,
  }) as jwt.JwtPayload;
  if (typeof payload.sub !== 'string' || typeof payload.tid !== 'string' || typeof payload.jti !== 'string') {
    throw new Error('Malformed refresh token');
  }
  return {
    tokenId: payload.jti, userId: payload.sub, tenantId: payload.tid, expiresAt: new Date((payload.exp as number) * 1000),
  };
}
