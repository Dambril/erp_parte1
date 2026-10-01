import { Router } from 'express';
import { getDatabase } from '../../config/database';
import { auditLog } from '../../core/audit';
import { asyncHandler } from '../../core/http-error';
import type { RealtimePublisher } from '../../core/realtime';
import { requireAuth } from '../../core/middlewares/auth';
import { requirePermission } from '../../core/middlewares/permissions';
import { identityRepositories } from '../identity/identity.repository';
import { ObrasController } from './obras.controller';
import { obrasRepository } from './obras.repository';
import { ObrasService } from './obras.service';

export function obrasRoutes(publish: RealtimePublisher): Router {
  const controller = new ObrasController(() => {
    const db = getDatabase();
    return new ObrasService(obrasRepository(db), identityRepositories(db).users, auditLog(db), publish);
  });

  const router = Router();
  router.use(requireAuth);
  router.get('/', requirePermission('obras', 'read'), asyncHandler(controller.list));
  // Antes de '/:id' para que "resumen" no se tome como id.
  router.get('/resumen', requirePermission('obras', 'read'), asyncHandler(controller.resumen));
  router.get('/:id', requirePermission('obras', 'read'), asyncHandler(controller.get));
  router.post('/', requirePermission('obras', 'create'), asyncHandler(controller.create));
  router.patch('/:id', requirePermission('obras', 'update'), asyncHandler(controller.update));
  router.delete('/:id', requirePermission('obras', 'delete'), asyncHandler(controller.remove));
  router.post('/:id/aprobar', requirePermission('obras', 'approve'), asyncHandler(controller.aprobar));
  router.post('/:id/solicitar-cambios', requirePermission('obras', 'approve'), asyncHandler(controller.solicitarCambios));
  // El residente de obra (rol "user") registra mediciones de campo.
  router.post('/:id/mediciones', requirePermission('obras', 'create'), asyncHandler(controller.registrarMedicion));
  return router;
}
