import type { Collection, Db } from 'mongodb';
import type { PublicUser, Role } from '@erp/domain';
import { TenantRepository, toApiDocument, type TenantScopedDocument } from '../../core/repository';

export const USERS_COLLECTION = 'users';
export const REFRESH_TOKENS_COLLECTION = 'refresh_tokens';

export interface UserDocument extends TenantScopedDocument {
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
}

/** Lista blanca explícita: un campo nuevo en UserDocument no se expone hasta añadirlo aquí. */
export function toPublicUser(user: UserDocument): PublicUser {
  const { id, tenantId, email, name, role, createdAt, updatedAt, deletedAt } = toApiDocument(user);
  return { id, tenantId, email, name, role, createdAt, updatedAt, deletedAt };
}

export class UsersRepository extends TenantRepository<UserDocument> {
  /**
   * Única consulta de identidad que NO va acotada por tenant: en el login aún no se conoce el tenant.
   * Es segura porque el email es único en toda la colección (índice `email_unique`).
   */
  async findActiveByEmailForLogin(email: string): Promise<UserDocument | null> {
    return this.collection.findOne({ email, deletedAt: null }) as Promise<UserDocument | null>;
  }
}

/** Refresh tokens emitidos. Guardar el `jti` permite rotarlos, revocarlos (logout) y detectar reutilización. */
export interface RefreshTokenDocument {
  _id: string;
  userId: string;
  tenantId: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export class RefreshTokensRepository {
  public constructor(private readonly collection: Collection<RefreshTokenDocument>) {}

  async create(token: Omit<RefreshTokenDocument, 'createdAt' | 'revokedAt'>): Promise<void> {
    await this.collection.insertOne({ ...token, createdAt: new Date(), revokedAt: null });
  }

  async findById(tokenId: string): Promise<RefreshTokenDocument | null> {
    return this.collection.findOne({ _id: tokenId });
  }

  /** Revoca de forma atómica; devuelve false si ya estaba revocado (o no existe). */
  async revoke(tokenId: string): Promise<boolean> {
    const result = await this.collection.updateOne({ _id: tokenId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    return result.modifiedCount === 1;
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.collection.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  }
}

export function identityRepositories(db: Db) {
  return {
    users: new UsersRepository(db.collection<UserDocument>(USERS_COLLECTION)),
    refreshTokens: new RefreshTokensRepository(db.collection<RefreshTokenDocument>(REFRESH_TOKENS_COLLECTION)),
  };
}

export async function ensureIdentityIndexes(db: Db): Promise<void> {
  await db.collection(USERS_COLLECTION).createIndexes([
    { key: { email: 1 }, name: 'email_unique', unique: true },
    { key: { tenantId: 1, deletedAt: 1 }, name: 'tenant_active' },
  ]);
  await db.collection(REFRESH_TOKENS_COLLECTION).createIndexes([
    // TTL: Mongo borra los tokens caducados automáticamente.
    { key: { expiresAt: 1 }, name: 'expires_ttl', expireAfterSeconds: 0 },
    { key: { userId: 1 }, name: 'user' },
  ]);
}
