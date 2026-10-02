import { Router } from 'express';
import { asyncHandler } from '../../../core/http-error';
import { requirePermission } from '../../../core/middlewares/permissions';
import type { ConstructionServices } from '../construction.container';
import { ProposalsController } from './proposals.controller';

export function proposalsRoutes(services: () => ConstructionServices): Router {
  const controller = new ProposalsController(() => services().proposals);

  const router = Router();
  router.get('/', requirePermission('construction.proposals:read'), asyncHandler(controller.list));
  router.post('/', requirePermission('construction.proposals:create'), asyncHandler(controller.create));
  router.get('/:id', requirePermission('construction.proposals:read'), asyncHandler(controller.get));
  router.patch('/:id', requirePermission('construction.proposals:update'), asyncHandler(controller.update));
  router.delete('/:id', requirePermission('construction.proposals:delete'), asyncHandler(controller.remove));
  router.post('/:id/submit', requirePermission('construction.proposals:submit'), asyncHandler(controller.submit));
  router.post('/:id/restore', requirePermission('construction.proposals:restore'), asyncHandler(controller.restore));
  router.post('/:id/approve', requirePermission('construction.proposals:approve'), asyncHandler(controller.approve));
  router.post('/:id/reject', requirePermission('construction.proposals:reject'), asyncHandler(controller.reject));
  return router;
}
