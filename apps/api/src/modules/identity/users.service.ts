import { MongoServerError, type ClientSession } from 'mongodb';
import type { z } from 'zod';
import {
  ROLE_LABEL, roleHasScopedPermission, RoleSchema,
  type AssignableRole, type ChangePasswordRequest, type InviteUserRequest, type InviteUserResponse, type Paginated, type PublicUser,
  type UsersQuerySchema,
} from '@erp/domain';
import type { ServerConfig } from '@erp/config';
import { withTransaction } from '../../config/database';
import type { AuditTrailRepository } from '../../core/audit';
import { HttpError } from '../../core/http-error';
import type { RequestUser } from '../../core/middlewares/auth';
import { sendEmailSafely, type EmailSender } from '../../platform/integrations/email';
import { invitationEmail } from './identity.emails';
import { toPublicUser, type IdentityRepositories, type UserDocument } from './identity.repository';
import { INVITATION_DAYS } from './identity.service';
import { hashPassword, verifyPassword } from './password';
import { generateOpaqueToken, hashToken } from './tokens';

const DAY = 24 * 60 * 60 * 1000;

/** "Administrador" es quien puede gestionar usuarios: se decide por el permiso, no por el nombre del rol. */
const ADMIN_ROLES = RoleSchema.options.filter((role) => roleHasScopedPermission(role, 'identity.users:manage'));
const isAdmin = (user: Pick<UserDocument, 'role'>) => ADMIN_ROLES.includes(user.role);

const notFound = () => new HttpError(404, 'USER_NOT_FOUND', 'El usuario no existe');
const lastAdmin = () => new HttpError(409, 'LAST_ADMIN', 'Es el último administrador activo: asigna antes a otro administrador');
const invalidTransition = (message: string) => new HttpError(409, 'INVALID_TRANSITION', message);
const unauthenticated = () => new HttpError(401, 'UNAUTHENTICATED', 'Authentication required');

export interface UsersDependencies extends IdentityRepositories {
  audit: AuditTrailRepository;
}

/** Gestión de usuarios del tenant y perfil propio. No existe eliminar usuario: el historial se conserva. */
export class UsersService {
  public constructor(
    private readonly deps: UsersDependencies,
    private readonly config: ServerConfig,
    private readonly emailSender: EmailSender,
  ) {}

  async list(query: z.output<typeof UsersQuerySchema>, actor: RequestUser): Promise<Paginated<PublicUser>> {
    const { page, pageSize, ...search } = query;
    const result = await this.deps.users.search(actor.tenantId, search, { page, pageSize });
    return { ...result, items: result.items.map(toPublicUser) };
  }

  /** Crea la cuenta en `invited` (sin contraseña) y envía el enlace para activarla. */
  async invite(input: InviteUserRequest, actor: RequestUser): Promise<InviteUserResponse> {
    const token = generateOpaqueToken();
    let user: UserDocument;
    try {
      user = await withTransaction(async (session) => {
        const created = await this.deps.users.insert({
          ...input, status: 'invited', passwordHash: null, failedLoginCount: 0, lockedUntil: null, custom: {},
        }, actor.tenantId, session);
        await this.storeInvitation(created, token, session);
        await this.record(
          created, actor, 'user.invited', `Invitó a ${created.name} (${created.email}) como ${ROLE_LABEL[created.role]}`, session,
        );
        return created;
      });
    } catch (error) {
      // El correo es único en toda la plataforma, no solo en el tenant.
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new HttpError(409, 'EMAIL_IN_USE', 'Ya existe una cuenta con ese correo');
      }
      throw error;
    }
    return { user: toPublicUser(user), emailSent: await this.sendInvitation(user, token) };
  }

  /** Enlace nuevo para una invitación pendiente; el anterior deja de servir. */
  async resendInvitation(id: string, actor: RequestUser): Promise<InviteUserResponse> {
    const user = await this.deps.users.findById(id, actor.tenantId);
    if (!user) throw notFound();
    if (user.status !== 'invited') throw invalidTransition('La invitación ya no está pendiente');
    const token = generateOpaqueToken();
    await withTransaction(async (session) => {
      await this.storeInvitation(user, token, session);
      await this.record(user, actor, 'user.invitation_resent', `Reenvió la invitación a ${user.name}`, session);
    });
    return { user: toPublicUser(user), emailSent: await this.sendInvitation(user, token) };
  }

  async changeRole(id: string, role: AssignableRole, actor: RequestUser): Promise<PublicUser> {
    return this.guarded(id, actor, async (current, session) => {
      if (current.role === role) return current;
      // Solo importa al quitarle el rol a quien hoy administra de verdad (una cuenta activa).
      if (current.status === 'active' && isAdmin(current) && !isAdmin({ role })) await this.ensureAnotherAdmin(current, session);
      const updated = await this.deps.users.setRole(id, actor.tenantId, role, session);
      if (!updated) throw notFound();
      await this.record(
        updated, actor, 'user.role_changed',
        `Cambió el rol de ${updated.name} de ${ROLE_LABEL[current.role]} a ${ROLE_LABEL[role]}`, session,
      );
      return updated;
    });
  }

  /** Desactiva la cuenta, cierra todas sus sesiones e invalida sus enlaces pendientes. */
  async deactivate(id: string, actor: RequestUser): Promise<PublicUser> {
    return this.guarded(id, actor, async (current, session) => {
      if (current.status === 'deactivated') throw invalidTransition('La cuenta ya está desactivada');
      if (current.status === 'active' && isAdmin(current)) await this.ensureAnotherAdmin(current, session);
      const updated = await this.deps.users.setStatus(id, actor.tenantId, ['active', 'invited'], 'deactivated', session);
      if (!updated) throw notFound();
      await this.deps.sessions.revokeAllForUser(id, actor.tenantId, 'deactivated', session);
      await this.deps.authTokens.deletePendingForUser(actor.tenantId, id, 'invitation', session);
      await this.deps.authTokens.deletePendingForUser(actor.tenantId, id, 'password_reset', session);
      await this.record(updated, actor, 'user.deactivated', `Desactivó el acceso de ${updated.name}`, session);
      return updated;
    });
  }

  /** Una cuenta que se desactivó antes de aceptar su invitación no tiene contraseña: vuelve a `invited`. */
  async reactivate(id: string, actor: RequestUser): Promise<PublicUser> {
    return this.guarded(id, actor, async (current, session) => {
      if (current.status !== 'deactivated') throw invalidTransition('La cuenta no está desactivada');
      const updated = await this.deps.users.setStatus(
        id, actor.tenantId, ['deactivated'], current.passwordHash ? 'active' : 'invited', session,
      );
      if (!updated) throw notFound();
      await this.record(updated, actor, 'user.reactivated', `Reactivó el acceso de ${updated.name}`, session);
      return updated;
    });
  }

  async updateProfile(name: string, actor: RequestUser): Promise<PublicUser> {
    const user = await this.deps.users.setName(actor.id, actor.tenantId, name);
    if (!user) throw unauthenticated();
    await this.record(user, actor, 'user.profile_updated', 'Actualizó su nombre');
    return toPublicUser(user);
  }

  /** Cambia la contraseña propia. Las demás sesiones se cierran; la que hace el cambio sigue viva. */
  async changePassword({ currentPassword, newPassword }: ChangePasswordRequest, actor: RequestUser): Promise<void> {
    const user = await this.deps.users.findById(actor.id, actor.tenantId);
    if (!user?.passwordHash) throw unauthenticated();
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new HttpError(400, 'INVALID_CURRENT_PASSWORD', 'La contraseña actual no es correcta');
    }
    // scrypt es lento a propósito: se calcula fuera de la transacción para no alargarla.
    const passwordHash = await hashPassword(newPassword);
    await withTransaction(async (session) => {
      if (!(await this.deps.users.setPassword(user._id, user.tenantId, passwordHash, 'active', session))) throw unauthenticated();
      await this.deps.sessions.revokeOthersForUser(user._id, user.tenantId, actor.sessionId, 'password_changed', session);
      await this.deps.authTokens.deletePendingForUser(user.tenantId, user._id, 'password_reset', session);
      await this.record(user, actor, 'user.password_changed', 'Cambió su contraseña', session);
    });
  }

  /**
   * Cambio sobre otro usuario dentro de una transacción que toma el candado del tenant: así la comprobación del
   * último administrador y la escritura no se intercalan con otro cambio simultáneo.
   */
  private async guarded(
    id: string, actor: RequestUser, change: (current: UserDocument, session: ClientSession) => Promise<UserDocument>,
  ): Promise<PublicUser> {
    return toPublicUser(await withTransaction(async (session) => {
      await this.deps.tenants.lock(actor.tenantId, session);
      const current = await this.deps.users.findById(id, actor.tenantId, session);
      if (!current) throw notFound();
      if (current.role === 'superadmin' && actor.role !== 'superadmin') {
        throw new HttpError(403, 'FORBIDDEN', 'Only a superadmin can manage superadmin users');
      }
      return change(current, session);
    }));
  }

  private async ensureAnotherAdmin(user: UserDocument, session: ClientSession): Promise<void> {
    if ((await this.deps.users.countActiveWithRoles(user.tenantId, ADMIN_ROLES, user._id, session)) === 0) throw lastAdmin();
  }

  private async storeInvitation(user: UserDocument, token: string, session: ClientSession): Promise<void> {
    await this.deps.authTokens.createForUser({
      tenantId: user.tenantId, userId: user._id, type: 'invitation', tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITATION_DAYS * DAY),
    }, session);
  }

  /** Aquí sí se espera el envío: quien invita necesita saber si el correo salió para poder reenviarlo. */
  private async sendInvitation(user: UserDocument, token: string): Promise<boolean> {
    const tenant = await this.deps.tenants.findById(user.tenantId);
    return sendEmailSafely(
      this.emailSender,
      invitationEmail(user.email, user.name, tenant?.name ?? 'tu empresa', token, this.config.appWebUrl, INVITATION_DAYS),
    );
  }

  private record(user: UserDocument, actor: RequestUser, action: string, summary: string, session?: ClientSession): Promise<void> {
    return this.deps.audit.record(
      { tenantId: actor.tenantId, actorId: actor.id, action, entityType: 'user', entityId: user._id, summary }, session,
    );
  }
}
