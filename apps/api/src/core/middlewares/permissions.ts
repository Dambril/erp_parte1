import type { RequestHandler } from 'express';
import { roleHasPermission, type ModuleAction, type PermissionAction, type PermissionModule, type Role } from '@erp/domain';
import { HttpError } from '../http-error';

export type { PermissionAction } from '@erp/domain';
export interface PermissionRequirement { module: PermissionModule; action: PermissionAction }

// El mapa de permisos por rol vive en @erp/domain (`roleHasPermission`, `permissionsForRole`):
// la API lo aplica aquí y `/me` lo entrega a los clientes para que oculten lo que el rol no puede hacer.
export function can(role: Role, { module, action }: PermissionRequirement): boolean {
  return roleHasPermission(role, module, action);
}

/**
 * Guard por ruta: `router.post('/', requirePermission('catalogs.product', 'create'), handler)`.
 * Solo acepta combinaciones del catálogo `PERMISSION_CATALOG` de @erp/domain (p. ej. `catalogs.product.create`).
 */
export function requirePermission<M extends PermissionModule>(module: M, action: ModuleAction<M>): RequestHandler {
  return (request, _response, next) => {
    if (!request.user) return next(new HttpError(401, 'UNAUTHENTICATED', 'Authentication required'));
    if (!can(request.user.role, { module, action })) {
      return next(new HttpError(403, 'FORBIDDEN', `Role "${request.user.role}" lacks permission ${module}.${action}`));
    }
    next();
  };
}
