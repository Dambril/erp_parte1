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

// ── Auth (identity) ────────────────────────────────────────────────

export const PasswordSchema = z.string().min(8, 'Password must be at least 8 characters').max(128);

export const LoginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const CreateUserRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(200),
  role: RoleSchema.default('user'),
  password: PasswordSchema,
});
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

export type PublicUser = Omit<User, 'custom'>;

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

// ── Decimales (Decimal128 en persistencia, texto en la API) ────────

/** Número decimal como texto, nunca `number`: hasta 20 cifras enteras y 10 decimales. */
export const DecimalStringSchema = z.string().trim()
  .regex(/^-?\d{1,20}(\.\d{1,10})?$/, 'Must be a decimal number written as a string, e.g. "12.50"');
export const NonNegativeDecimalSchema = DecimalStringSchema.refine((value) => !value.startsWith('-'), 'Must be zero or positive');
export const PositiveDecimalSchema = DecimalStringSchema
  .refine((value) => !value.startsWith('-') && /[1-9]/.test(value), 'Must be greater than zero');
export const NonZeroDecimalSchema = DecimalStringSchema.refine((value) => /[1-9]/.test(value), 'Must not be zero');
export type DecimalString = string;

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

// ── Permisos ───────────────────────────────────────────────────────

export const PermissionActionSchema = z.enum(['read', 'create', 'update', 'delete']);
export type PermissionAction = z.infer<typeof PermissionActionSchema>;

const CRUD = ['read', 'create', 'update', 'delete'] as const;

/**
 * Catálogo (seed) de permisos por módulo y acción: `catalogs.product.create`, `inventory.reversal.create`, etc.
 * `requirePermission` solo acepta combinaciones de esta lista; qué rol tiene cada acción lo decide la matriz de roles de la API.
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
export type Permission = { [M in PermissionModule]: `${M}.${ModuleAction<M>}` }[PermissionModule];

export const PERMISSIONS: readonly Permission[] = Object.entries(PERMISSION_CATALOG)
  .flatMap(([module, actions]) => actions.map((action) => `${module}.${action}` as Permission));

// ── Catálogos ──────────────────────────────────────────────────────

const IdSchema = z.string().uuid();
const CodeSchema = z.string().trim().min(1).max(50);
const NameSchema = z.string().trim().min(1).max(200);
/** Campos configurables por cliente; nunca se modifica el núcleo por un cliente. */
export const CustomFieldsSchema = z.record(z.unknown());

/** Forma de un registro de catálogo en la API: campos base + los propios de la entidad (que incluyen `custom`). */
export type CatalogRecord<T> = Omit<BaseDocument, 'custom'> & T;

export const UnitInputSchema = z.object({
  code: CodeSchema,
  name: NameSchema,
  /** Cifras decimales permitidas en cantidades de productos con esta unidad. */
  decimals: z.number().int().min(0).max(6),
  custom: CustomFieldsSchema.default({}),
});
export const UnitUpdateSchema = UnitInputSchema.partial();
export type UnitInput = z.input<typeof UnitInputSchema>;
export type Unit = CatalogRecord<z.output<typeof UnitInputSchema>>;

export const TaxTypeSchema = z.enum(['transfer', 'withholding']);
export const TaxInputSchema = z.object({
  code: CodeSchema,
  name: NameSchema,
  /** Tasa como fracción: `"0.16"` = 16 %. */
  rate: NonNegativeDecimalSchema,
  type: TaxTypeSchema,
  active: z.boolean().default(true),
  custom: CustomFieldsSchema.default({}),
});
export const TaxUpdateSchema = TaxInputSchema.partial();
export type TaxInput = z.input<typeof TaxInputSchema>;
export type Tax = CatalogRecord<z.output<typeof TaxInputSchema>>;

export const CurrencyInputSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Must be a 3-letter ISO 4217 code'),
  name: NameSchema,
  symbol: z.string().trim().min(1).max(10),
  decimals: z.number().int().min(0).max(4).default(2),
  custom: CustomFieldsSchema.default({}),
});
export const CurrencyUpdateSchema = CurrencyInputSchema.partial();
export type CurrencyInput = z.input<typeof CurrencyInputSchema>;
export type Currency = CatalogRecord<z.output<typeof CurrencyInputSchema>>;

export const ProductCategoryInputSchema = z.object({
  name: NameSchema,
  parentId: IdSchema.nullable().default(null),
  custom: CustomFieldsSchema.default({}),
});
export const ProductCategoryUpdateSchema = ProductCategoryInputSchema.partial();
export type ProductCategoryInput = z.input<typeof ProductCategoryInputSchema>;
export type ProductCategory = CatalogRecord<z.output<typeof ProductCategoryInputSchema>>;

export const ProductTypeSchema = z.enum(['good', 'service']);
export const TrackingSchema = z.enum(['none', 'lot', 'serial']);

const ProductFieldsSchema = z.object({
  sku: z.string().trim().min(1).max(64),
  name: NameSchema,
  description: z.string().trim().max(2000).default(''),
  type: ProductTypeSchema,
  categoryId: IdSchema.nullable().default(null),
  unitId: IdSchema,
  taxIds: z.array(IdSchema).max(20).default([]),
  tracking: TrackingSchema.default('none'),
  cost: NonNegativeDecimalSchema.default('0'),
  salePrice: NonNegativeDecimalSchema.default('0'),
  currencyId: IdSchema.nullable().default(null),
  active: z.boolean().default(true),
  custom: CustomFieldsSchema.default({}),
});
export const ProductInputSchema = ProductFieldsSchema.refine(
  (product) => product.type === 'good' || product.tracking === 'none',
  { message: 'Services cannot have lot or serial tracking', path: ['tracking'] },
);
/**
 * `type`, `tracking` y `unitId` no cambian tras crear el producto: alteraría el significado de sus movimientos.
 * Es estricto para que intentar cambiarlos responda 400 en lugar de ignorarse en silencio.
 */
export const ProductUpdateSchema = ProductFieldsSchema.omit({ type: true, tracking: true, unitId: true }).partial().strict();
export type ProductInput = z.input<typeof ProductInputSchema>;
export type Product = CatalogRecord<z.output<typeof ProductFieldsSchema>>;

const ContactSchema = z.object({
  name: z.string().trim().max(200).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z.string().trim().max(50).optional(),
});
const AddressSchema = z.object({
  street: z.string().trim().max(300).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  country: z.string().trim().max(100).optional(),
});

/** Clientes y proveedores comparten forma. */
export const PartyInputSchema = z.object({
  code: CodeSchema,
  legalName: NameSchema,
  taxId: z.string().trim().max(50).nullable().default(null),
  contact: ContactSchema.default({}),
  address: AddressSchema.default({}),
  /** Días de crédito. */
  paymentTermDays: z.number().int().min(0).max(365).default(0),
  active: z.boolean().default(true),
  custom: CustomFieldsSchema.default({}),
});
export const PartyUpdateSchema = PartyInputSchema.partial();
export type PartyInput = z.input<typeof PartyInputSchema>;
export type Customer = CatalogRecord<z.output<typeof PartyInputSchema>>;
export type Supplier = Customer;

export const WarehouseInputSchema = z.object({
  code: CodeSchema,
  name: NameSchema,
  branch: z.string().trim().max(200).nullable().default(null),
  active: z.boolean().default(true),
  custom: CustomFieldsSchema.default({}),
});
export const WarehouseUpdateSchema = WarehouseInputSchema.partial();
export type WarehouseInput = z.input<typeof WarehouseInputSchema>;
export type Warehouse = CatalogRecord<z.output<typeof WarehouseInputSchema>>;

/** Recursos REST de `/catalogs/<recurso>` con su tipo de entrada y de salida. */
export interface CatalogResources {
  units: { input: UnitInput; record: Unit };
  taxes: { input: TaxInput; record: Tax };
  currencies: { input: CurrencyInput; record: Currency };
  'product-categories': { input: ProductCategoryInput; record: ProductCategory };
  products: { input: ProductInput; record: Product };
  customers: { input: PartyInput; record: Customer };
  suppliers: { input: PartyInput; record: Supplier };
  warehouses: { input: WarehouseInput; record: Warehouse };
}
export type CatalogResource = keyof CatalogResources;

// ── Inventario ─────────────────────────────────────────────────────

export const MovementTypeSchema = z.enum(['entry', 'exit', 'adjustment', 'transfer_out', 'transfer_in', 'reversal']);
export type MovementType = z.infer<typeof MovementTypeSchema>;

export const MovementReferenceSchema = z.object({
  /** Documento origen, p. ej. `purchase`, `sale`, `manual`. */
  type: z.string().trim().min(1).max(50),
  id: z.string().trim().min(1).max(100).optional(),
  note: z.string().trim().max(500).optional(),
});
export type MovementReference = z.infer<typeof MovementReferenceSchema>;

const TrackingInputSchema = z.object({
  /** Obligatorio si el producto se sigue por lote. */
  lotCode: z.string().trim().min(1).max(100).optional(),
  /** Solo al crear el lote en su primera entrada. */
  lotExpiresAt: z.string().datetime().optional(),
  /** Obligatorio si el producto se sigue por serie. */
  serialNumber: z.string().trim().min(1).max(100).optional(),
});

/** Movimientos operables por API. Entrada y salida llevan cantidad positiva; el ajuste lleva signo. */
export const CreateMovementSchema = TrackingInputSchema.extend({
  type: z.enum(['entry', 'exit', 'adjustment']),
  productId: IdSchema,
  warehouseId: IdSchema,
  quantity: NonZeroDecimalSchema,
  unitCost: NonNegativeDecimalSchema.optional(),
  reference: MovementReferenceSchema.optional(),
}).refine(
  (movement) => movement.type === 'adjustment' || !movement.quantity.startsWith('-'),
  { message: 'Entry and exit quantities must be positive; the direction comes from the type', path: ['quantity'] },
);
export type CreateMovementRequest = z.input<typeof CreateMovementSchema>;

export const CreateTransferSchema = TrackingInputSchema.omit({ lotExpiresAt: true }).extend({
  productId: IdSchema,
  fromWarehouseId: IdSchema,
  toWarehouseId: IdSchema,
  quantity: PositiveDecimalSchema,
  reference: MovementReferenceSchema.optional(),
}).refine((transfer) => transfer.fromWarehouseId !== transfer.toWarehouseId, {
  message: 'Source and destination warehouses must differ', path: ['toWarehouseId'],
});
export type CreateTransferRequest = z.input<typeof CreateTransferSchema>;

export const ReverseMovementSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});
export type ReverseMovementRequest = z.input<typeof ReverseMovementSchema>;

export const CreateLotSchema = z.object({
  productId: IdSchema,
  code: z.string().trim().min(1).max(100),
  expiresAt: z.string().datetime().nullable().default(null),
});
export type CreateLotRequest = z.input<typeof CreateLotSchema>;

export const LotQuerySchema = PaginationQuerySchema.omit({ q: true }).extend({ productId: IdSchema });

export const InventorySettingsSchema = z.object({
  /** Por defecto `false`: una salida que dejaría la existencia bajo cero se rechaza. */
  allowNegativeStock: z.boolean(),
});
export type InventorySettings = z.infer<typeof InventorySettingsSchema>;

export const StockQuerySchema = PaginationQuerySchema.omit({ q: true }).extend({
  productId: IdSchema.optional(),
  warehouseId: IdSchema.optional(),
});
export type StockQuery = z.input<typeof StockQuerySchema>;

export const KardexQuerySchema = PaginationQuerySchema.omit({ q: true }).extend({
  warehouseId: IdSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type KardexQuery = z.input<typeof KardexQuerySchema>;

export interface InventoryMovement {
  id: string;
  tenantId: string;
  /** `series-number`, p. ej. `MOV-15`. */
  folio: string;
  series: string;
  number: number;
  type: MovementType;
  productId: string;
  warehouseId: string;
  lotId: string | null;
  /** Positiva entrante, negativa saliente. */
  quantity: DecimalString;
  unitCost: DecimalString | null;
  reference: MovementReference | null;
  reversedMovementId: string | null;
  transferId: string | null;
  userId: string;
  createdAt: string;
}

export interface StockLevel {
  id: string;
  tenantId: string;
  productId: string;
  warehouseId: string;
  lotId: string | null;
  quantity: DecimalString;
  updatedAt: string;
}

export interface Lot {
  id: string;
  tenantId: string;
  productId: string;
  kind: 'lot' | 'serial';
  code: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface TransferResult {
  transferId: string;
  out: InventoryMovement;
  in: InventoryMovement;
}

export interface KardexEntry extends InventoryMovement {
  /** Existencia acumulada tras este movimiento (con los filtros de la consulta). */
  balance: DecimalString;
}

export interface Kardex extends Paginated<KardexEntry> {
  productId: string;
  warehouseId: string | null;
  /** Existencia antes del primer movimiento de la página. */
  openingBalance: DecimalString;
}

export interface ReconciliationDifference {
  productId: string;
  warehouseId: string;
  lotId: string | null;
  /** Suma de movimientos. */
  expected: DecimalString;
  /** Valor en `stock_levels` (`"0"` si no existe el registro). */
  actual: DecimalString;
}

export interface ReconciliationReport {
  tenantId: string;
  checkedAt: string;
  balancesChecked: number;
  differences: ReconciliationDifference[];
}
