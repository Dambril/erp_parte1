import { randomUUID } from 'node:crypto';
import type { ClientSession, Collection, Db } from 'mongodb';
import type { PublicUser, Role, UserStatus } from '@erp/domain';
import { TenantRepository, toApiDocument, type TenantScopedDocument } from '../../core/repository';

export const USERS_COLLECTION = 'users';
export const SESSIONS_COLLECTION = 'sessions';
export const AUTH_TOKENS_COLLECTION = 'authTokens';
export const TENANTS_COLLECTION = 'tenants';

type CustomFields = Record<string, unknown>;

// ── Usuarios ───────────────────────────────────────────────────────

export interface UserDocument extends TenantScopedDocument {
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  /** `null` mientras la cuenta está invitada y aún no define contraseña. */
  passwordHash: string | null;
  /** Intentos fallidos seguidos; vuelve a 0 con un login correcto o al bloquear. */
  failedLoginCount: number;
  lockedUntil: Date | null;
  custom: CustomFields;
}

/** Lista blanca explícita: un campo nuevo en UserDocument no se expone hasta añadirlo aquí. */
export function toPublicUser(user: UserDocument): PublicUser {
  const { id, tenantId, email, name, role, status, createdAt, updatedAt, deletedAt } = toApiDocument(user);
  return { id, tenantId, email, name, role, status, createdAt, updatedAt, deletedAt };
}

export class UsersRepository extends TenantRepository<UserDocument> {
  /**
   * Excepción a la regla de tenant (ADR 0003): en login y recuperación aún no se conoce el tenant.
   * Es segura porque el email es único en toda la colección (índice `email_unique`); el tenant sale del documento.
   */
  async findByEmailAcrossTenants(email: string): Promise<UserDocument | null> {
    return this.collection.findOne({ email, deletedAt: null }) as Promise<UserDocument | null>;
  }

  /**
   * Suma un intento fallido de forma atómica. Al llegar a `maxAttempts` bloquea hasta `lockUntil`
   * y reinicia el contador, para que tras el bloqueo haya otra tanda completa de intentos.
   */
  async recordFailedLogin(id: string, tenantId: string, maxAttempts: number, lockUntil: Date): Promise<void> {
    const reachedLimit = { $gte: [{ $add: [{ $ifNull: ['$failedLoginCount', 0] }, 1] }, maxAttempts] };
    await this.collection.updateOne(this.scoped(tenantId, { _id: id }), [{
      $set: {
        lockedUntil: { $cond: [reachedLimit, lockUntil, '$lockedUntil'] },
        failedLoginCount: { $cond: [reachedLimit, 0, { $add: [{ $ifNull: ['$failedLoginCount', 0] }, 1] }] },
        updatedAt: '$$NOW',
      },
    }]);
  }

  async clearFailedLogins(id: string, tenantId: string): Promise<void> {
    await this.collection.updateOne(
      this.scoped(tenantId, { _id: id }),
      { $set: { failedLoginCount: 0, lockedUntil: null, updatedAt: new Date() } },
    );
  }

  /**
   * Define la contraseña solo si la cuenta está en `fromStatus` (restablecer: `active`; activar: `invited`)
   * y la deja `active`. Devuelve null si no aplica.
   */
  async setPassword(
    id: string, tenantId: string, passwordHash: string, fromStatus: UserStatus, session?: ClientSession,
  ): Promise<UserDocument | null> {
    return this.collection.findOneAndUpdate(
      this.scoped(tenantId, { _id: id, status: fromStatus }),
      { $set: { passwordHash, status: 'active', failedLoginCount: 0, lockedUntil: null, updatedAt: new Date() } },
      { returnDocument: 'after', session },
    ) as Promise<UserDocument | null>;
  }
}

// ── Sesiones ───────────────────────────────────────────────────────

/** Una sesión por refresh token emitido: rotar revoca la actual y crea otra. El token en claro nunca se guarda. */
export interface SessionDocument {
  _id: string;
  tenantId: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  /** Por qué se revocó: solo reutilizar una sesión `rotated` se trata como robo del refresh token. */
  revokedReason: SessionRevokeReason | null;
  custom: CustomFields;
  createdAt: Date;
  updatedAt: Date;
}

export type SessionRevokeReason = 'rotated' | 'logout' | 'password_changed' | 'reuse_detected';

export type NewSession = Pick<SessionDocument, 'tenantId' | 'userId' | 'refreshTokenHash' | 'expiresAt'>;

export class SessionsRepository {
  public constructor(private readonly collection: Collection<SessionDocument>) {}

  async create(session: NewSession): Promise<SessionDocument> {
    const now = new Date();
    const document: SessionDocument = {
      ...session, _id: randomUUID(), revokedAt: null, revokedReason: null, custom: {}, createdAt: now, updatedAt: now,
    };
    await this.collection.insertOne(document);
    return document;
  }

  /** Excepción a la regla de tenant (ADR 0003): el refresh token es la única credencial; su hash es único. */
  async findByRefreshTokenHashAcrossTenants(refreshTokenHash: string): Promise<SessionDocument | null> {
    return this.collection.findOne({ refreshTokenHash });
  }

  /** Revoca de forma atómica; devuelve false si ya estaba revocada (o no existe). */
  async revoke(id: string, tenantId: string, reason: SessionRevokeReason): Promise<boolean> {
    const now = new Date();
    const result = await this.collection.updateOne(
      { _id: id, tenantId, revokedAt: null },
      { $set: { revokedAt: now, revokedReason: reason, updatedAt: now } },
    );
    return result.modifiedCount === 1;
  }

  async revokeAllForUser(userId: string, tenantId: string, reason: SessionRevokeReason, session?: ClientSession): Promise<void> {
    const now = new Date();
    await this.collection.updateMany(
      { tenantId, userId, revokedAt: null },
      { $set: { revokedAt: now, revokedReason: reason, updatedAt: now } },
      { session },
    );
  }
}

// ── Tokens de un solo uso (restablecer contraseña, invitación) ─────

export type AuthTokenType = 'password_reset' | 'invitation';

export interface AuthTokenDocument {
  _id: string;
  tenantId: string;
  userId: string;
  type: AuthTokenType;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  custom: CustomFields;
  createdAt: Date;
  updatedAt: Date;
}

export type NewAuthToken = Pick<AuthTokenDocument, 'tenantId' | 'userId' | 'type' | 'tokenHash' | 'expiresAt'>;

export class AuthTokensRepository {
  public constructor(private readonly collection: Collection<AuthTokenDocument>) {}

  /** Un token nuevo invalida los pendientes del mismo usuario y tipo: solo sirve el último enlace enviado. */
  async createForUser(token: NewAuthToken): Promise<void> {
    await this.collection.deleteMany({ tenantId: token.tenantId, userId: token.userId, type: token.type, usedAt: null });
    const now = new Date();
    await this.collection.insertOne({ ...token, _id: randomUUID(), usedAt: null, custom: {}, createdAt: now, updatedAt: now });
  }

  /**
   * Excepción a la regla de tenant (ADR 0003): el token llega por correo y su hash es único.
   * Lo consume de forma atómica; devuelve null si no existe, es de otro tipo, ya se usó o venció.
   */
  async consumeAcrossTenants(tokenHash: string, type: AuthTokenType, session?: ClientSession): Promise<AuthTokenDocument | null> {
    const now = new Date();
    return this.collection.findOneAndUpdate(
      { tokenHash, type, usedAt: null, expiresAt: { $gt: now } },
      { $set: { usedAt: now, updatedAt: now } },
      { session },
    );
  }
}

// ── Empresas (tenants) ─────────────────────────────────────────────

/** El `_id` es el propio `tenantId` (el mismo texto que llevan los demás documentos y el access token). */
export interface TenantDocument {
  _id: string;
  tenantId: string;
  name: string;
  custom: CustomFields;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class TenantsRepository {
  public constructor(private readonly collection: Collection<TenantDocument>) {}

  async findById(tenantId: string): Promise<TenantDocument | null> {
    return this.collection.findOne({ _id: tenantId, tenantId, deletedAt: null });
  }

  /** Crea la empresa si no existe; si existe no la modifica. Devuelve true si la creó. */
  async ensure(tenantId: string, name: string): Promise<boolean> {
    const now = new Date();
    const result = await this.collection.updateOne(
      { _id: tenantId },
      { $setOnInsert: { tenantId, name, custom: {}, createdAt: now, updatedAt: now, deletedAt: null } },
      { upsert: true },
    );
    return result.upsertedCount === 1;
  }
}

export function identityRepositories(db: Db) {
  return {
    users: new UsersRepository(db.collection<UserDocument>(USERS_COLLECTION)),
    sessions: new SessionsRepository(db.collection<SessionDocument>(SESSIONS_COLLECTION)),
    authTokens: new AuthTokensRepository(db.collection<AuthTokenDocument>(AUTH_TOKENS_COLLECTION)),
    tenants: new TenantsRepository(db.collection<TenantDocument>(TENANTS_COLLECTION)),
  };
}

export type IdentityRepositories = ReturnType<typeof identityRepositories>;

export async function ensureIdentityIndexes(db: Db): Promise<void> {
  await db.collection(USERS_COLLECTION).createIndexes([
    { key: { email: 1 }, name: 'email_unique', unique: true },
    { key: { tenantId: 1, deletedAt: 1 }, name: 'tenant_active' },
  ]);
  await db.collection(SESSIONS_COLLECTION).createIndexes([
    { key: { tenantId: 1, userId: 1 }, name: 'tenant_user' },
    { key: { refreshTokenHash: 1 }, name: 'refresh_token_hash_unique', unique: true },
    // TTL: Mongo borra las sesiones vencidas automáticamente.
    { key: { expiresAt: 1 }, name: 'expires_ttl', expireAfterSeconds: 0 },
  ]);
  await db.collection(AUTH_TOKENS_COLLECTION).createIndexes([
    { key: { tokenHash: 1 }, name: 'token_hash_unique', unique: true },
    { key: { expiresAt: 1 }, name: 'expires_ttl', expireAfterSeconds: 0 },
    { key: { tenantId: 1, userId: 1, type: 1 }, name: 'tenant_user_type' },
  ]);
}

/**
 * Migración idempotente de usuarios creados antes del control de estado e intentos:
 * se consideran activos (ya podían entrar) y reciben los campos nuevos con su valor inicial.
 */
export async function migrateIdentityDocuments(db: Db): Promise<void> {
  const users = db.collection(USERS_COLLECTION);
  await users.updateMany({ status: { $exists: false } }, { $set: { status: 'active' } });
  await users.updateMany({ failedLoginCount: { $exists: false } }, { $set: { failedLoginCount: 0 } });
  await users.updateMany({ lockedUntil: { $exists: false } }, { $set: { lockedUntil: null } });
  await users.updateMany({ custom: { $exists: false } }, { $set: { custom: {} } });
}
