import { MongoServerError } from 'mongodb';
import {
  permissionsForRole,
  type AcceptInvitationRequest, type AuthSession, type CreateUserRequest, type LoginRequest, type MeResponse, type PublicUser,
  type ResetPasswordRequest,
} from '@erp/domain';
import type { ServerConfig } from '@erp/config';
import { HttpError } from '../../core/http-error';
import type { AuditLogRepository } from '../../core/audit';
import { withTransaction } from '../../config/database';
import { sendEmailSafely, type EmailSender } from '../../platform/integrations/email';
import type { RequestUser } from '../../core/middlewares/auth';
import { getDummyHash, hashPassword, verifyPassword } from './password';
import { generateOpaqueToken, hashToken, signAccessToken } from './tokens';
import { passwordResetEmail, welcomeEmail } from '../../platform/integrations/email/templates';
import { toPublicUser, type AuthTokenType, type IdentityRepositories, type UserDocument } from './identity.repository';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 5;
export const REFRESH_TOKEN_DAYS = 30;
export const PASSWORD_RESET_MINUTES = 60;
/** Vigencia de las invitaciones (las emite `UsersService`). */
export const INVITATION_DAYS = 7;

// Un único mensaje para correo inexistente, contraseña incorrecta y cuenta no activa: no revela qué cuentas existen.
const invalidCredentials = () => new HttpError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos');
const tooManyAttempts = () => new HttpError(429, 'TOO_MANY_ATTEMPTS', `Demasiados intentos. Vuelve a intentarlo en ${LOCK_MINUTES} minutos.`);
const invalidRefreshToken = () => new HttpError(401, 'INVALID_REFRESH_TOKEN', 'La sesión no es válida o ya venció');
const invalidToken = () => new HttpError(400, 'INVALID_TOKEN', 'El enlace no es válido o ya venció');

export interface IdentityDependencies extends IdentityRepositories {
  audit: AuditLogRepository;
}

export class IdentityService {
  public constructor(
    private readonly deps: IdentityDependencies,
    private readonly config: ServerConfig,
    private readonly emailSender: EmailSender,
  ) {}

  async login({ email, password }: LoginRequest): Promise<AuthSession> {
    const user = await this.deps.users.findByEmailAcrossTenants(email);
    if (!user || user.status !== 'active' || !user.passwordHash) {
      // Se verifica contra un hash falso para que el tiempo de respuesta no revele si la cuenta existe.
      await verifyPassword(password, await getDummyHash());
      throw invalidCredentials();
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) throw tooManyAttempts();

    if (!(await verifyPassword(password, user.passwordHash))) {
      await this.deps.users.recordFailedLogin(user._id, user.tenantId, MAX_FAILED_LOGINS, new Date(Date.now() + LOCK_MINUTES * MINUTE));
      throw invalidCredentials();
    }
    if (user.failedLoginCount > 0 || user.lockedUntil) await this.deps.users.clearFailedLogins(user._id, user.tenantId);
    return this.issueSession(user);
  }

  /** Rota el refresh token: la sesión usada queda revocada y se emite un par nuevo en otra sesión. */
  async refresh(refreshToken: string): Promise<AuthSession> {
    const current = await this.deps.sessions.findByRefreshTokenHashAcrossTenants(hashToken(refreshToken));
    if (!current || current.expiresAt <= new Date()) throw invalidRefreshToken();
    if (!(await this.deps.sessions.revoke(current._id, current.tenantId, 'rotated'))) {
      // Un refresh token ya rotado que vuelve a usarse indica robo (lo usaron dos partes): se cierran todas las sesiones.
      // Uno cerrado por logout o cambio de contraseña simplemente ya no sirve.
      const revoked = await this.deps.sessions.findByRefreshTokenHashAcrossTenants(current.refreshTokenHash);
      if (revoked?.revokedReason !== 'rotated') throw invalidRefreshToken();
      await this.deps.sessions.revokeAllForUser(current.userId, current.tenantId, 'reuse_detected');
      throw new HttpError(401, 'REFRESH_TOKEN_REUSED', 'La sesión ya se había renovado; por seguridad se cerraron todas tus sesiones');
    }

    const user = await this.deps.users.findById(current.userId, current.tenantId);
    if (!user || user.status !== 'active') throw invalidRefreshToken();
    return this.issueSession(user);
  }

  /** Revoca la sesión que emitió el access token. Idempotente. */
  async logout(actor: RequestUser): Promise<void> {
    await this.deps.sessions.revoke(actor.sessionId, actor.tenantId, 'logout');
  }

  /**
   * Responde igual exista o no el correo (no revela qué correos están registrados).
   * El envío no se espera: así tampoco se filtra por tiempo de respuesta ni se cuelga si Resend tarda.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.deps.users.findByEmailAcrossTenants(email);
    if (!user || user.status !== 'active') return;
    const token = await this.issueOneTimeToken(user, 'password_reset', PASSWORD_RESET_MINUTES * MINUTE);
    void sendEmailSafely(this.emailSender, passwordResetEmail({
      to: user.email, name: user.name, token, appWebUrl: this.config.appWebUrl, validMinutes: PASSWORD_RESET_MINUTES,
    }));
  }

  /** Cambia la contraseña con un token de un solo uso y cierra todas las sesiones. No inicia sesión. */
  async resetPassword({ token, password }: ResetPasswordRequest): Promise<void> {
    await this.setPasswordWithToken(token, password, 'password_reset');
  }

  /** Define la contraseña de una cuenta invitada y la deja activa. No inicia sesión. */
  async acceptInvitation({ token, password }: AcceptInvitationRequest): Promise<void> {
    await this.setPasswordWithToken(token, password, 'invitation');
  }

  async getMe(userId: string, tenantId: string): Promise<MeResponse> {
    const user = await this.deps.users.findById(userId, tenantId);
    // Una cuenta desactivada o borrada con un access token aún vigente ya no recibe sus datos.
    if (!user || user.status !== 'active') throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required');
    const tenant = await this.deps.tenants.findById(tenantId);
    return {
      user: toPublicUser(user),
      // Sin registro de empresa (tenants anteriores a la colección) se muestra su identificador.
      company: { id: tenantId, name: tenant?.name ?? tenantId },
      role: user.role,
      permissions: permissionsForRole(user.role),
    };
  }

  async getUser(userId: string, tenantId: string): Promise<PublicUser> {
    const user = await this.deps.users.findById(userId, tenantId);
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found');
    return toPublicUser(user);
  }

  /**
   * Alta directa de una cuenta activa con contraseña, para el seed y las pruebas: por la API las cuentas se dan
   * de alta por invitación (`UsersService.invite`). `actor` es quien la crea; pertenece siempre al tenant indicado.
   */
  async createUser(input: CreateUserRequest, tenantId: string, actor?: RequestUser): Promise<PublicUser> {
    if (input.role === 'superadmin' && actor && actor.role !== 'superadmin') {
      throw new HttpError(403, 'FORBIDDEN', 'Only a superadmin can create superadmin users');
    }
    try {
      const user = await this.deps.users.insert({
        email: input.email,
        name: input.name,
        role: input.role,
        status: 'active',
        passwordHash: await hashPassword(input.password),
        failedLoginCount: 0,
        lockedUntil: null,
        custom: {},
      }, tenantId);
      void sendEmailSafely(this.emailSender, welcomeEmail({ to: user.email, name: user.name, appWebUrl: this.config.appWebUrl }));
      return toPublicUser(user);
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new HttpError(409, 'EMAIL_TAKEN', 'A user with this email already exists');
      }
      throw error;
    }
  }

  private async issueOneTimeToken(user: UserDocument, type: AuthTokenType, validMs: number): Promise<string> {
    const token = generateOpaqueToken();
    await this.deps.authTokens.createForUser({
      tenantId: user.tenantId, userId: user._id, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + validMs),
    });
    return token;
  }

  /**
   * Consume el token, guarda la contraseña, revoca las sesiones y deja constancia en la bitácora, todo o nada:
   * si algo falla el token sigue sin usar y el usuario puede reintentar.
   */
  private async setPasswordWithToken(token: string, password: string, type: AuthTokenType): Promise<void> {
    // scrypt es lento a propósito: se calcula fuera de la transacción para no alargarla.
    const passwordHash = await hashPassword(password);
    await withTransaction(async (session) => {
      const stored = await this.deps.authTokens.consumeAcrossTenants(hashToken(token), type, session);
      if (!stored) throw invalidToken();
      const fromStatus = type === 'invitation' ? 'invited' : 'active';
      const user = await this.deps.users.setPassword(stored.userId, stored.tenantId, passwordHash, fromStatus, session);
      if (!user) throw invalidToken();
      await this.deps.sessions.revokeAllForUser(user._id, user.tenantId, 'password_changed', session);
      await this.deps.audit.record({
        tenantId: user.tenantId,
        actorId: user._id,
        action: type === 'invitation' ? 'invitation_accepted' : 'password_reset',
        entity: 'user',
        entityId: user._id,
        // Nunca el hash: solo el cambio de estado relevante.
        before: { status: fromStatus },
        after: { status: user.status },
      }, session);
    });
  }

  private async issueSession(user: UserDocument): Promise<AuthSession> {
    const refreshToken = generateOpaqueToken();
    const session = await this.deps.sessions.create({
      tenantId: user.tenantId,
      userId: user._id,
      refreshTokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * DAY),
    });
    return {
      accessToken: signAccessToken({ userId: user._id, tenantId: user.tenantId, role: user.role, sessionId: session._id }, this.config),
      refreshToken,
      user: toPublicUser(user),
    };
  }
}
