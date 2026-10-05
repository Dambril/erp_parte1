import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { Db } from 'mongodb';
import type { ServerConfig } from '@erp/config';
import { getDatabase } from '../../config/database';
import { auditRepository, auditTrailRepository } from '../../core/audit';
import { asyncHandler } from '../../core/http-error';
import { requireAuth } from '../../core/middlewares/auth';
import { requirePermission } from '../../core/middlewares/permissions';
import { createEmailSender, type EmailSender } from '../../platform/integrations/email';
import { identityRepositories } from './identity.repository';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/** Servicio de identidad sobre una base concreta (rutas, scripts y pruebas). */
export function createIdentityService(db: Db, config: ServerConfig, emailSender: EmailSender): IdentityService {
  return new IdentityService({ ...identityRepositories(db), audit: auditRepository(db) }, config, emailSender);
}

/** Gestión de usuarios y perfil; su bitácora es `auditLog`, la misma que consulta la actividad de construcción. */
export function createUsersService(db: Db, config: ServerConfig, emailSender: EmailSender): UsersService {
  return new UsersService({ ...identityRepositories(db), audit: auditTrailRepository(db) }, config, emailSender);
}

export function identityRoutes(
  config: ServerConfig,
  emailSender: EmailSender = createEmailSender(config),
): { auth: Router; me: Router; users: Router } {
  // El servicio se construye por petición para tomar la conexión activa (y poder testear con otra base).
  const controller = new IdentityController(() => createIdentityService(getDatabase(), config, emailSender), config);
  const usersController = new UsersController(() => createUsersService(getDatabase(), config, emailSender));

  // Freno a fuerza bruta por IP (10 intentos cada 15 minutos), además del bloqueo por cuenta del servicio.
  const attemptsLimiter = () => rateLimit({
    windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (request, response) => {
      response.status(429).json({
        success: false,
        error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Vuelve a intentarlo más tarde.' },
        timestamp: new Date().toISOString(),
        path: request.path,
      });
    },
  });

  const auth = Router();
  auth.post('/login', attemptsLimiter(), asyncHandler(controller.login));
  auth.post('/refresh', asyncHandler(controller.refresh));
  auth.post('/logout', requireAuth, asyncHandler(controller.logout));
  auth.post('/password/forgot', attemptsLimiter(), asyncHandler(controller.forgotPassword));
  auth.post('/password/reset', attemptsLimiter(), asyncHandler(controller.resetPassword));
  auth.post('/invitations/accept', attemptsLimiter(), asyncHandler(controller.acceptInvitation));

  const me = Router();
  me.use(requireAuth);
  me.get('/', asyncHandler(controller.me));
  me.patch('/', requirePermission('identity.profile:update'), asyncHandler(usersController.updateProfile));
  // Mismo freno que el login: aquí también se prueba una contraseña.
  me.post('/password', attemptsLimiter(), requirePermission('identity.profile:update'), asyncHandler(usersController.changePassword));

  // Las cuentas se dan de alta por invitación; no existe eliminar usuario.
  const users = Router();
  users.use(requireAuth, requirePermission('identity.users:manage'));
  users.get('/', asyncHandler(usersController.list));
  users.post('/invitations', asyncHandler(usersController.invite));
  users.post('/:id/invitations/resend', asyncHandler(usersController.resendInvitation));
  users.patch('/:id/role', asyncHandler(usersController.changeRole));
  users.post('/:id/deactivate', asyncHandler(usersController.deactivate));
  users.post('/:id/reactivate', asyncHandler(usersController.reactivate));

  return { auth, me, users };
}
