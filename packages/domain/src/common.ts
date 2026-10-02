import { z } from 'zod';

// ── Roles ──────────────────────────────────────────────────────────

export const RoleSchema = z.enum(['superadmin', 'admin', 'manager', 'user', 'viewer']);
export type Role = z.infer<typeof RoleSchema>;

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: 'Superadministrador',
  admin: 'Administrador',
  manager: 'Gerente de proyecto',
  user: 'Residente de obra',
  viewer: 'Consulta',
};

// ── Paginación ─────────────────────────────────────────────────────

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).max(100).optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

// ── Campos configurables ───────────────────────────────────────────

/** Campos configurables por cliente; nunca se modifica el núcleo por un cliente. */
export const CustomFieldsSchema = z.record(z.unknown());
