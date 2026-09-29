import type { RequestHandler } from 'express';
import type { ModuleAction, PermissionAction, PermissionModule, Role } from '@erp/domain';
import { HttpError } from '../http-error';

export type { PermissionAction } from '@erp/domain';
export interface PermissionRequirement { module: PermissionModule; action: PermissionAction }

// RBAC base. Punto único para ajustar permisos cuando cada módulo defina los suyos.
const ROLE_ACTIONS: Record<Role, readonly PermissionAction[] | 'all'> = {
  superadmin: 'all',
  admin: 'all',
  manager: ['read', 'create', 'update'],
  user: ['read', 'create'],
  viewer: ['read'],
};

// Módulos de administración: solo admin y superadmin, sea cual sea la acción.
const ADMIN_ONLY_MODULES = new Set<PermissionModule>(['users', 'inventory.settings', 'inventory.reconciliation']);

export function can(role: Role, { module, action }: PermissionRequirement): boolean {
  const allowed = ROLE_ACTIONS[role];
  if (allowed === 'all') return true;
  if (ADMIN_ONLY_MODULES.has(module)) return false;
  return allowed.includes(action);
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
