import { z } from 'zod';

// ── Money (Decimal128 representation) ──────────────────────────────

export const MoneySchema = z.object({
  amount: z.string(),
  currency: z.string().length(3).default('USD'),
});
export type Money = z.infer<typeof MoneySchema>;

// ── TenantId ───────────────────────────────────────────────────────

export const TenantIdSchema = z.string().min(1);
export type TenantId = z.infer<typeof TenantIdSchema>;

// ── Timestamp ──────────────────────────────────────────────────────

export const TimestampSchema = z.string().datetime();
export type Timestamp = z.infer<typeof TimestampSchema>;

// ── Base document fields ───────────────────────────────────────────

export const BaseDocumentSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  deletedAt: z.string().datetime().nullable().optional(),
  custom: z.record(z.unknown()).default({}),
});
export type BaseDocument = z.infer<typeof BaseDocumentSchema>;

// ── Role & User ────────────────────────────────────────────────────

export const RoleSchema = z.enum(['superadmin', 'admin', 'manager', 'user', 'viewer']);
export type Role = z.infer<typeof RoleSchema>;

export const UserSchema = BaseDocumentSchema.extend({
  email: z.string().email(),
  name: z.string().min(1),
  role: RoleSchema.default('user'),
});
export type User = z.infer<typeof UserSchema>;

// ── Error response ─────────────────────────────────────────────────

export const ErrorDetailSchema = z.object({
  field: z.string().optional(),
  message: z.string(),
  code: z.string(),
});

export const ApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(ErrorDetailSchema).optional(),
  }),
  timestamp: TimestampSchema,
  path: z.string(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;

// ── Standard API response ──────────────────────────────────────────

export const ApiResponseSchema = z.object({
  success: z.literal(true),
  data: z.unknown(),
  timestamp: TimestampSchema,
});

export type ApiResponse<T = unknown> = {
  success: true;
  data: T;
  timestamp: string;
};
