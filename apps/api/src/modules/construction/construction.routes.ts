import { Router } from 'express';
import { getDatabase } from '../../config/database';
import { asyncHandler } from '../../core/http-error';
import { requireAuth } from '../../core/middlewares/auth';
import { requirePermission } from '../../core/middlewares/permissions';
import type { RealtimePublisher } from '../../core/realtime';
import { budgetRoutes } from './budget/budget.routes';
import { certificationsRoutes } from './certifications/certifications.routes';
import { constructionServices } from './construction.container';
import { DashboardController } from './dashboard.controller';
import { projectsRoutes } from './projects/projects.routes';
import { proposalsRoutes } from './proposals/proposals.routes';
import { trashRoutes } from './trash/trash.routes';

/** Módulo vertical de construcción: propuestas, obras, presupuesto y certificaciones, montado en `/construction`. */
export function constructionRoutes(publish: RealtimePublisher, now?: () => Date): Router {
  // Los servicios se construyen por petición para tomar la conexión activa (y poder testear con otra base).
  const services = () => constructionServices(getDatabase(), publish, now);
  const dashboard = new DashboardController(() => services().dashboard);

  const router = Router();
  router.use(requireAuth);
  router.get('/dashboard', requirePermission('construction.dashboard:read'), asyncHandler(dashboard.get));
  // Antes de `/projects` para que sus rutas anidadas no las capture el router de obras.
  router.use('/projects/:id/budget-movements', budgetRoutes(services));
  router.use('/projects/:id/certification', certificationsRoutes(services));
  router.use('/projects', projectsRoutes(services));
  router.use('/proposals', proposalsRoutes(services));
  router.use('/trash', trashRoutes(services));
  return router;
}
