import { z } from 'zod';
import type { Role } from './common';

// ── Permisos por acción (catálogos, inventario, usuarios) ──────────
// Compartidos para que la API los aplique y los clientes oculten lo que el rol no puede hacer.

export type PermissionAction = 'read' | 'create' | 'update' | 'delete' | 'approve';

export const ROLE_ACTIONS: Record<Role, readonly PermissionAction[] | 'all'> = {
  superadmin: 'all',
  admin: 'all',
  manager: ['read', 'create', 'update', 'approve'],
  user: ['read', 'create'],
  viewer: ['read'],
};

export function roleCan(role: Role, action: PermissionAction): boolean {
  const allowed = ROLE_ACTIONS[role];
  return allowed === 'all' || allowed.includes(action);
}

export const PermissionActionSchema = z.enum(['read', 'create', 'update', 'delete', 'approve']) satisfies z.ZodType<PermissionAction>;

const CRUD = ['read', 'create', 'update', 'delete'] as const;

/**
 * Catálogo (seed) de permisos por módulo y acción: `catalogs.product.create`, `inventory.reversal.create`, etc.
 * `requirePermission` solo acepta combinaciones de esta lista; qué rol tiene cada acción lo decide `ROLE_ACTIONS`.
 */
export const PERMISSION_CATALOG = {
  users: ['read', 'create'],
  'catalogs.unit': CRUD,
  'catalogs.tax': CRUD,
  'catalogs.currency': CRUD,
  'catalogs.category': CRUD,
  'catalogs.product': CRUD,
  'catalogs.customer': CRUD,
  'catalogs.supplier': CRUD,
  'catalogs.warehouse': CRUD,
  'inventory.movement': ['read', 'create'],
  'inventory.transfer': ['create'],
  'inventory.reversal': ['create'],
  'inventory.stock': ['read'],
  'inventory.lot': ['read', 'create'],
  'inventory.settings': ['read', 'update'],
  'inventory.reconciliation': ['read'],
} as const satisfies Record<string, readonly PermissionAction[]>;

export type PermissionModule = keyof typeof PERMISSION_CATALOG;
export type ModuleAction<M extends PermissionModule> = (typeof PERMISSION_CATALOG)[M][number];
export type ActionPermission = { [M in PermissionModule]: `${M}.${ModuleAction<M>}` }[PermissionModule];

const ACTION_PERMISSIONS: readonly ActionPermission[] = Object.entries(PERMISSION_CATALOG)
  .flatMap(([module, actions]) => actions.map((action) => `${module}.${action}` as ActionPermission));

/** Módulos de administración: solo los roles con `'all'`, sea cual sea la acción. */
export const ADMIN_ONLY_MODULES: ReadonlySet<PermissionModule> = new Set<PermissionModule>([
  'users', 'inventory.settings', 'inventory.reconciliation',
]);

export function roleHasPermission(role: Role, module: PermissionModule, action: PermissionAction): boolean {
  if (ROLE_ACTIONS[role] === 'all') return true;
  if (ADMIN_ONLY_MODULES.has(module)) return false;
  return roleCan(role, action);
}

// ── Permisos por recurso (`modulo.recurso:accion`) ─────────────────
// Mapa explícito de rol a permisos: aquí no se deduce nada de la acción.

export const SCOPED_PERMISSIONS = [
  'construction.dashboard:read',
  'construction.projects:read',
  'construction.projects:update',
  'construction.projects:archive',
  'construction.projects:delete',
  'construction.projects:restore',
  'construction.proposals:read',
  'construction.proposals:create',
  'construction.proposals:update',
  'construction.proposals:submit',
  'construction.proposals:approve',
  'construction.proposals:reject',
  'construction.proposals:delete',
  'construction.proposals:restore',
  'construction.budget:read_amounts',
  'construction.budget:adjust',
  'construction.certifications:update',
  'identity.profile:update',
  'identity.users:manage',
] as const;
export type ScopedPermission = (typeof SCOPED_PERMISSIONS)[number];

const USER_PERMISSIONS: readonly ScopedPermission[] = [
  'construction.dashboard:read',
  'construction.projects:read',
  'construction.proposals:read',
  'identity.profile:update',
];

/** Dos perfiles: administración y usuario. Los demás roles heredan uno de los dos. */
export const ROLE_PERMISSIONS: Record<Role, readonly ScopedPermission[]> = {
  superadmin: SCOPED_PERMISSIONS,
  admin: SCOPED_PERMISSIONS,
  manager: USER_PERMISSIONS,
  user: USER_PERMISSIONS,
  viewer: USER_PERMISSIONS,
};

export function roleHasScopedPermission(role: Role, permission: ScopedPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

// ── Lista completa ─────────────────────────────────────────────────

export type Permission = ActionPermission | ScopedPermission;

export const PERMISSIONS: readonly Permission[] = [...ACTION_PERMISSIONS, ...SCOPED_PERMISSIONS];

/** Mapa único de permisos por rol: lo aplica la API (`requirePermission`) y lo entrega `/me` a los clientes. */
export function permissionsForRole(role: Role): Permission[] {
  const byAction = ACTION_PERMISSIONS.filter((permission) => {
    const separator = permission.lastIndexOf('.');
    return roleHasPermission(role, permission.slice(0, separator) as PermissionModule, permission.slice(separator + 1) as PermissionAction);
  });
  return [...byAction, ...ROLE_PERMISSIONS[role]];
}
