import { Router } from 'express';
import { getDatabase } from '../../config/database';
import { auditRepository } from '../../core/audit';
import { asyncHandler } from '../../core/http-error';
import { requireAuth } from '../../core/middlewares/auth';
import { requirePermission } from '../../core/middlewares/permissions';
import { catalogRepositories } from '../catalogs/catalogs.repository';
import { inventoryRepositories } from './inventory.repository';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

/** Los movimientos solo se crean y se consultan: no hay PUT, PATCH ni DELETE (las correcciones son reversas). */
export function inventoryRoutes(): Router {
  // El servicio se construye por petición para tomar la conexión activa (y poder testear con otra base).
  const controller = new InventoryController(() => {
    const db = getDatabase();
    return new InventoryService(inventoryRepositories(db), catalogRepositories(db), auditRepository(db));
  });

  const router = Router();
  router.use(requireAuth);
  router.post('/movements', requirePermission('inventory.movement', 'create'), asyncHandler(controller.createMovement));
  router.get('/movements/:id', requirePermission('inventory.movement', 'read'), asyncHandler(controller.getMovement));
  router.post('/movements/:id/reverse', requirePermission('inventory.reversal', 'create'), asyncHandler(controller.reverseMovement));
  router.post('/transfers', requirePermission('inventory.transfer', 'create'), asyncHandler(controller.createTransfer));
  router.get('/stock', requirePermission('inventory.stock', 'read'), asyncHandler(controller.stock));
  router.get('/kardex/:productId', requirePermission('inventory.movement', 'read'), asyncHandler(controller.kardex));
  router.get('/lots', requirePermission('inventory.lot', 'read'), asyncHandler(controller.listLots));
  router.post('/lots', requirePermission('inventory.lot', 'create'), asyncHandler(controller.createLot));
  router.get('/settings', requirePermission('inventory.settings', 'read'), asyncHandler(controller.getSettings));
  router.put('/settings', requirePermission('inventory.settings', 'update'), asyncHandler(controller.updateSettings));
  router.get('/reconciliation', requirePermission('inventory.reconciliation', 'read'), asyncHandler(controller.reconciliation));
  return router;
}
