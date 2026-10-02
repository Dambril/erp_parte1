import { Router } from 'express';
import { asyncHandler } from '../../../core/http-error';
import { requirePermission } from '../../../core/middlewares/permissions';
import type { ConstructionServices } from '../construction.container';
import { ProjectsController } from './projects.controller';

export function projectsRoutes(services: () => ConstructionServices): Router {
  const controller = new ProjectsController(() => services().projects);

  const router = Router();
  router.get('/', requirePermission('construction.projects:read'), asyncHandler(controller.list));
  router.get('/:id', requirePermission('construction.projects:read'), asyncHandler(controller.get));
  router.patch('/:id', requirePermission('construction.projects:update'), asyncHandler(controller.update));
  router.post('/:id/transition', requirePermission('construction.projects:update'), asyncHandler(controller.transition));
  router.post('/:id/archive', requirePermission('construction.projects:archive'), asyncHandler(controller.archive));
  router.post('/:id/unarchive', requirePermission('construction.projects:archive'), asyncHandler(controller.unarchive));
  router.delete('/:id', requirePermission('construction.projects:delete'), asyncHandler(controller.remove));
  router.post('/:id/restore', requirePermission('construction.projects:restore'), asyncHandler(controller.restore));
  router.get('/:id/activity', requirePermission('construction.projects:read'), asyncHandler(controller.activity));
  return router;
}
