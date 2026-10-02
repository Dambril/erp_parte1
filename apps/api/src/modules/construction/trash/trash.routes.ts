import { Router } from 'express';
import { asyncHandler } from '../../../core/http-error';
import { requireAnyPermission } from '../../../core/middlewares/permissions';
import type { ConstructionServices } from '../construction.container';
import { TrashController } from './trash.controller';

/** Restaurar vive en las rutas de cada entidad (`/projects/:id/restore`, `/proposals/:id/restore`). */
export function trashRoutes(services: () => ConstructionServices): Router {
  const controller = new TrashController(() => services().trash);

  const router = Router();
  router.get(
    '/', requireAnyPermission('construction.projects:restore', 'construction.proposals:restore'), asyncHandler(controller.list),
  );
  return router;
}
