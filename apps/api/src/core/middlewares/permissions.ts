import type { RequestHandler } from 'express';
import { ROLE_ACTIONS, roleCan, type PermissionAction, type Role } from '@erp/domain';
import { HttpError } from '../http-error';

export type { PermissionAction };
export interface PermissionRequirement { module: string; action: PermissionAction }

// Módulos de administración: solo admin y superadmin, sea cual sea la acción.
const ADMIN_ONLY_MODULES = new Set(['users']);

export function can(role: Role, { module, action }: PermissionRequirement): boolean {
  if (ROLE_ACTIONS[role] === 'all') return true;
  if (ADMIN_ONLY_MODULES.has(module)) return false;
  return roleCan(role, action);
}

/** Guard por ruta: `router.post('/', requirePermission('users', 'create'), handler)`. */
export function requirePermission(module: string, action: PermissionAction): RequestHandler {
  return (request, _response, next) => {
    if (!request.user) return next(new HttpError(401, 'UNAUTHENTICATED', 'Authentication required'));
    if (!can(request.user.role, { module, action })) {
      return next(new HttpError(403, 'FORBIDDEN', `Role "${request.user.role}" cannot ${action} ${module}`));
    }
    next();
  };
}
