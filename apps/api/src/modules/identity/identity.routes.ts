import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { Db } from 'mongodb';
import type { ServerConfig } from '@erp/config';
import { getDatabase } from '../../config/database';
import { auditRepository } from '../../core/audit';
import { asyncHandler } from '../../core/http-error';
import { requireAuth } from '../../core/middlewares/auth';
import { requirePermission } from '../../core/middlewares/permissions';
import { createEmailSender, type EmailSender } from '../../platform/integrations/email';
import { identityRepositories } from './identity.repository';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';

/** Servicio de identidad sobre una base concreta (rutas, scripts y pruebas). */
export function createIdentityService(db: Db, config: ServerConfig, emailSender: EmailSender): IdentityService {
  return new IdentityService({ ...identityRepositories(db), audit: auditRepository(db) }, config, emailSender);
}

export function identityRoutes(
  config: ServerConfig,
  emailSender: EmailSender = createEmailSender(config),
): { auth: Router; me: Router; users: Router } {
  // El servicio se construye por petición para tomar la conexión activa (y poder testear con otra base).
  const controller = new IdentityController(() => createIdentityService(getDatabase(), config, emailSender));

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
  me.get('/', requireAuth, asyncHandler(controller.me));

  const users = Router();
  users.use(requireAuth);
  users.get('/', requirePermission('users', 'read'), asyncHandler(controller.listUsers));
  users.post('/', requirePermission('users', 'create'), asyncHandler(controller.createUser));

  return { auth, me, users };
}
