import { Router } from 'express';
import { asyncHandler } from '../../../core/http-error';
import { requirePermission } from '../../../core/middlewares/permissions';
import type { ConstructionServices } from '../construction.container';
import { ProposalsController } from './proposals.controller';

export function proposalsRoutes(services: () => ConstructionServices): Router {
  const controller = new ProposalsController(() => services().proposals);

  const router = Router();
  router.get('/', requirePermission('construction.proposals:read'), asyncHandler(controller.list));
  router.get('/:id', requirePermission('construction.proposals:read'), asyncHandler(controller.get));
  router.post('/:id/approve', requirePermission('construction.proposals:approve'), asyncHandler(controller.approve));
  router.post('/:id/reject', requirePermission('construction.proposals:reject'), asyncHandler(controller.reject));
  return router;
}
