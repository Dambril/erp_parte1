import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { RoleSchema, type Role } from '@erp/domain';
import type { ServerConfig } from '@erp/config';

const ISSUER = 'erp-api';
const ACCESS_AUDIENCE = 'erp-access';

type ExpiresIn = NonNullable<jwt.SignOptions['expiresIn']>;

export interface AccessTokenClaims {
  userId: string;
  tenantId: string;
  role: Role;
  /** Sesión que emitió el token: permite que `/auth/logout` revoque justo esa sesión. */
  sessionId: string;
}

export function signAccessToken(claims: AccessTokenClaims, config: ServerConfig): string {
  return jwt.sign({ tenantId: claims.tenantId, role: claims.role, sid: claims.sessionId }, config.jwtSecret, {
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
  if (typeof payload.sub !== 'string' || typeof payload.tenantId !== 'string' || typeof payload.sid !== 'string') {
    throw new Error('Malformed access token');
  }
  return { userId: payload.sub, tenantId: payload.tenantId, role: RoleSchema.parse(payload.role), sessionId: payload.sid };
}

/**
 * Token opaco de 32 bytes aleatorios (refresh, restablecer contraseña, invitación).
 * En claro solo lo conoce su destinatario; en la base se guarda `hashToken(token)`.
 */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 en hexadecimal. Basta un hash rápido sin sal: el token ya tiene 256 bits de entropía. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
