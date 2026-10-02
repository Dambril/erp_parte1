import type { RequestHandler } from 'express';
import {
  roleHasPermission, roleHasScopedPermission,
  type ModuleAction, type PermissionAction, type PermissionModule, type Role, type ScopedPermission,
} from '@erp/domain';
import { HttpError } from '../http-error';

export type { PermissionAction } from '@erp/domain';
export interface PermissionRequirement { module: PermissionModule; action: PermissionAction }

// El mapa de permisos por rol vive en @erp/domain (`roleHasPermission`, `ROLE_PERMISSIONS`, `permissionsForRole`):
// la API lo aplica aquí y `/me` lo entrega a los clientes para que oculten lo que el rol no puede hacer.
export function can(role: Role, requirement: PermissionRequirement | ScopedPermission): boolean {
  return typeof requirement === 'string'
    ? roleHasScopedPermission(role, requirement)
    : roleHasPermission(role, requirement.module, requirement.action);
}

/**
 * Guard por ruta. Dos formas, según el módulo:
 * - `requirePermission('construction.projects:archive')`: permiso por recurso (`ROLE_PERMISSIONS`).
 * - `requirePermission('catalogs.product', 'create')`: combinación del catálogo `PERMISSION_CATALOG`.
 */
export function requirePermission(permission: ScopedPermission): RequestHandler;
export function requirePermission<M extends PermissionModule>(module: M, action: ModuleAction<M>): RequestHandler;
export function requirePermission(target: ScopedPermission | PermissionModule, action?: PermissionAction): RequestHandler {
  const requirement = action ? { module: target as PermissionModule, action } : target as ScopedPermission;
  const label = action ? `${target}.${action}` : target;
  return (request, _response, next) => {
    if (!request.user) return next(new HttpError(401, 'UNAUTHENTICATED', 'Authentication required'));
    if (!can(request.user.role, requirement)) {
      return next(new HttpError(403, 'FORBIDDEN', `Role "${request.user.role}" lacks permission ${label}`));
    }
    next();
  };
}

/** Guard para rutas que sirven a más de un permiso (la papelera): basta con tener uno. */
export function requireAnyPermission(...permissions: ScopedPermission[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.user) return next(new HttpError(401, 'UNAUTHENTICATED', 'Authentication required'));
    const { role } = request.user;
    if (!permissions.some((permission) => can(role, permission))) {
      return next(new HttpError(403, 'FORBIDDEN', `Role "${role}" lacks permission ${permissions.join(' or ')}`));
    }
    next();
  };
}
