import { Router } from 'express';
import { asyncHandler } from '../../../core/http-error';
import { requirePermission } from '../../../core/middlewares/permissions';
import type { ConstructionServices } from '../construction.container';
import { BudgetController } from './budget.controller';

/** Los movimientos solo se crean y se consultan: no hay PUT, PATCH ni DELETE (las correcciones son otro movimiento). */
export function budgetRoutes(services: () => ConstructionServices): Router {
  const controller = new BudgetController(() => services().budget);

  const router = Router({ mergeParams: true });
  router.get('/', requirePermission('construction.budget:read_amounts'), asyncHandler(controller.list));
  router.post('/', requirePermission('construction.budget:adjust'), asyncHandler(controller.adjust));
  return router;
}
