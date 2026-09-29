import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { ServerConfig } from '@erp/config';
import { getDatabase } from '../../config/database';
import { asyncHandler } from '../../core/http-error';
import { requireAuth } from '../../core/middlewares/auth';
import { requirePermission } from '../../core/middlewares/permissions';
import { identityRepositories } from './identity.repository';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';

export function identityRoutes(config: ServerConfig): { auth: Router; users: Router } {
  // El servicio se construye por petición para tomar la conexión activa (y poder testear con otra base).
  const controller = new IdentityController(() => {
    const { users, refreshTokens } = identityRepositories(getDatabase());
    return new IdentityService(users, refreshTokens, config);
  });

  // Freno a fuerza bruta: 10 intentos de login por IP cada 15 minutos.
  const credentialsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json({
        success: false,
        error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts, try again later' },
        timestamp: new Date().toISOString(),
      });
    },
  });

  const auth = Router();
  auth.post('/login', credentialsLimiter, asyncHandler(controller.login));
  auth.post('/refresh', asyncHandler(controller.refresh));
  auth.post('/logout', asyncHandler(controller.logout));
  auth.get('/me', requireAuth, asyncHandler(controller.me));

  const users = Router();
  users.use(requireAuth);
  users.get('/', requirePermission('users', 'read'), asyncHandler(controller.listUsers));
  users.post('/', requirePermission('users', 'create'), asyncHandler(controller.createUser));

  return { auth, users };
}
