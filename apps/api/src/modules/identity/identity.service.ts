import { randomUUID } from 'node:crypto';
import { MongoServerError } from 'mongodb';
import type { AuthSession, CreateUserRequest, LoginRequest, PublicUser } from '@erp/domain';
import type { ServerConfig } from '@erp/config';
import { HttpError } from '../../core/http-error';
import type { RequestUser } from '../../core/middlewares/auth';
import { getDummyHash, hashPassword, verifyPassword } from './password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from './tokens';
import {
  toPublicUser, type RefreshTokensRepository, type UserDocument, type UsersRepository,
} from './identity.repository';

const invalidCredentials = () => new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
const invalidRefreshToken = () => new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token');

export class IdentityService {
  public constructor(
    private readonly users: UsersRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly config: ServerConfig,
  ) {}

  async login({ email, password }: LoginRequest): Promise<AuthSession> {
    const user = await this.users.findActiveByEmailForLogin(email);
    if (!user) {
      await verifyPassword(password, await getDummyHash());
      throw invalidCredentials();
    }
    if (!(await verifyPassword(password, user.passwordHash))) throw invalidCredentials();
    return this.issueSession(user);
  }

  /** Rota el refresh token: el usado queda revocado y se emite un par nuevo. */
  async refresh(refreshToken: string): Promise<AuthSession> {
    let claims;
    try {
      claims = verifyRefreshToken(refreshToken, this.config);
    } catch {
      throw invalidRefreshToken();
    }

    const stored = await this.refreshTokens.findById(claims.tokenId);
    if (!stored) throw invalidRefreshToken();
    if (!(await this.refreshTokens.revoke(claims.tokenId))) {
      // Un token ya revocado que vuelve a usarse indica robo: se cierran todas las sesiones del usuario.
      await this.refreshTokens.revokeAllForUser(stored.userId);
      throw new HttpError(401, 'REFRESH_TOKEN_REUSED', 'Refresh token was already used; all sessions were revoked');
    }

    const user = await this.users.findById(claims.userId, claims.tenantId);
    if (!user) throw invalidRefreshToken();
    return this.issueSession(user);
  }

  /** Idempotente: un token inválido o ya revocado no produce error. */
  async logout(refreshToken: string): Promise<void> {
    try {
      const { tokenId } = verifyRefreshToken(refreshToken, this.config);
      await this.refreshTokens.revoke(tokenId);
    } catch {
      // Nada que revocar.
    }
  }

  async getUser(userId: string, tenantId: string): Promise<PublicUser> {
    const user = await this.users.findById(userId, tenantId);
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found');
    return toPublicUser(user);
  }

  async listUsers(tenantId: string): Promise<PublicUser[]> {
    return (await this.users.findMany(tenantId)).map(toPublicUser);
  }

  /** `actor` es quien crea el usuario; el nuevo usuario siempre pertenece al tenant indicado. */
  async createUser(input: CreateUserRequest, tenantId: string, actor?: RequestUser): Promise<PublicUser> {
    if (input.role === 'superadmin' && actor && actor.role !== 'superadmin') {
      throw new HttpError(403, 'FORBIDDEN', 'Only a superadmin can create superadmin users');
    }
    try {
      const user = await this.users.insert({
        email: input.email,
        name: input.name,
        role: input.role,
        passwordHash: await hashPassword(input.password),
      }, tenantId);
      return toPublicUser(user);
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new HttpError(409, 'EMAIL_TAKEN', 'A user with this email already exists');
      }
      throw error;
    }
  }

  private async issueSession(user: UserDocument): Promise<AuthSession> {
    const tokenId = randomUUID();
    const refresh = signRefreshToken({ tokenId, userId: user._id, tenantId: user.tenantId }, this.config);
    await this.refreshTokens.create({ _id: tokenId, userId: user._id, tenantId: user.tenantId, expiresAt: refresh.expiresAt });
    return {
      accessToken: signAccessToken({ userId: user._id, tenantId: user.tenantId, role: user.role }, this.config),
      refreshToken: refresh.token,
      user: toPublicUser(user),
    };
  }
}
