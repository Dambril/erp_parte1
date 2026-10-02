import type { Db } from 'mongodb';
import type { RequestUser } from '../../core/middlewares/auth';
import { identityRepositories } from './identity.repository';
import type { AccessTokenClaims } from './tokens';

/**
 * Comprueba contra la base que el access token sigue valiendo (ADR 0005): su sesión no está revocada ni
 * vencida y la cuenta sigue activa. Así desactivar a alguien o cerrar su sesión corta el acceso al instante,
 * sin esperar a que el token expire. El rol sale de la base, no del token: un cambio de rol aplica de inmediato.
 * Ambas lecturas van acotadas al `tenantId` del token. Devuelve `null` si el acceso ya no es válido.
 */
export async function resolveAccess(db: Db, claims: AccessTokenClaims): Promise<RequestUser | null> {
  const { users, sessions } = identityRepositories(db);
  const [session, user] = await Promise.all([
    sessions.findLive(claims.sessionId, claims.tenantId),
    users.findById(claims.userId, claims.tenantId),
  ]);
  if (!session || session.userId !== claims.userId || !user || user.status !== 'active') return null;
  return { id: user._id, tenantId: user.tenantId, role: user.role, sessionId: session._id };
}
