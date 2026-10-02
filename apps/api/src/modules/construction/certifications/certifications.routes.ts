import { Router } from 'express';
import { asyncHandler } from '../../../core/http-error';
import { requirePermission } from '../../../core/middlewares/permissions';
import type { ConstructionServices } from '../construction.container';
import { CertificationsController } from './certifications.controller';

export function certificationsRoutes(services: () => ConstructionServices): Router {
  const controller = new CertificationsController(() => services().certifications);

  const router = Router({ mergeParams: true });
  router.patch('/requirements/:code', requirePermission('construction.certifications:update'), asyncHandler(controller.updateRequirement));
  return router;
}
