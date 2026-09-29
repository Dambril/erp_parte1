import { Router } from 'express';
import type { CatalogResource } from '@erp/domain';
import { getDatabase } from '../../config/database';
import { auditRepository } from '../../core/audit';
import { asyncHandler } from '../../core/http-error';
import { requireAuth } from '../../core/middlewares/auth';
import { requirePermission } from '../../core/middlewares/permissions';
import { catalogRepositories, stockUsageRepository, type CatalogEntity } from './catalogs.repository';
import { CatalogsController } from './catalogs.controller';
import { CatalogsService } from './catalogs.service';

/** Ruta REST → entidad (y permiso `catalogs.<entidad>.<acción>`). */
export const CATALOG_RESOURCES: Record<CatalogResource, CatalogEntity> = {
  units: 'unit',
  taxes: 'tax',
  currencies: 'currency',
  'product-categories': 'category',
  products: 'product',
  customers: 'customer',
  suppliers: 'supplier',
  warehouses: 'warehouse',
};

export function catalogsRoutes(): Router {
  // El servicio se construye por petición para tomar la conexión activa (y poder testear con otra base).
  const service = () => {
    const db = getDatabase();
    return new CatalogsService(catalogRepositories(db), stockUsageRepository(db), auditRepository(db));
  };

  const router = Router();
  router.use(requireAuth);
  for (const [resource, entity] of Object.entries(CATALOG_RESOURCES) as [CatalogResource, CatalogEntity][]) {
    const controller = new CatalogsController(entity, service);
    const permission = `catalogs.${entity}` as const;
    router.get(`/${resource}`, requirePermission(permission, 'read'), asyncHandler(controller.list));
    router.get(`/${resource}/:id`, requirePermission(permission, 'read'), asyncHandler(controller.get));
    router.post(`/${resource}`, requirePermission(permission, 'create'), asyncHandler(controller.create));
    router.patch(`/${resource}/:id`, requirePermission(permission, 'update'), asyncHandler(controller.update));
    router.delete(`/${resource}/:id`, requirePermission(permission, 'delete'), asyncHandler(controller.remove));
  }
  return router;
}
