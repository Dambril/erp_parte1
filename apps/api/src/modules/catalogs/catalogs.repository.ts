import { Decimal128, type Collection, type Db, type Filter } from 'mongodb';
import type { PaginationQuery } from '@erp/domain';
import { escapeRegex, TenantRepository, type Page, type TenantScopedDocument } from '../../core/repository';
import { STOCK_LEVELS_COLLECTION, type StockLevelDocument } from '../inventory/inventory.repository';

export const CATALOG_COLLECTIONS = {
  unit: 'units',
  tax: 'taxes',
  currency: 'currencies',
  category: 'product_categories',
  product: 'products',
  customer: 'customers',
  supplier: 'suppliers',
  warehouse: 'warehouses',
} as const;
export type CatalogEntity = keyof typeof CATALOG_COLLECTIONS;

export interface CatalogDocument extends TenantScopedDocument {
  custom: Record<string, unknown>;
}

export interface UnitDocument extends CatalogDocument {
  code: string;
  name: string;
  decimals: number;
}

export interface TaxDocument extends CatalogDocument {
  code: string;
  name: string;
  rate: Decimal128;
  type: 'transfer' | 'withholding';
  active: boolean;
}

export interface CurrencyDocument extends CatalogDocument {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
}

export interface CategoryDocument extends CatalogDocument {
  name: string;
  parentId: string | null;
}

export interface ProductDocument extends CatalogDocument {
  sku: string;
  name: string;
  description: string;
  type: 'good' | 'service';
  categoryId: string | null;
  unitId: string;
  taxIds: string[];
  tracking: 'none' | 'lot' | 'serial';
  cost: Decimal128;
  salePrice: Decimal128;
  currencyId: string | null;
  active: boolean;
}

export interface PartyDocument extends CatalogDocument {
  code: string;
  legalName: string;
  taxId: string | null;
  contact: { name?: string; email?: string; phone?: string };
  address: { street?: string; city?: string; state?: string; postalCode?: string; country?: string };
  paymentTermDays: number;
  active: boolean;
}

export interface WarehouseDocument extends CatalogDocument {
  code: string;
  name: string;
  branch: string | null;
  active: boolean;
}

export class CatalogRepository<T extends CatalogDocument> extends TenantRepository<T> {
  /** Página ordenada por creación; `q` busca como texto literal (sin distinguir mayúsculas) en `searchFields`. */
  async search(tenantId: string, { page, pageSize, q }: PaginationQuery, searchFields: readonly string[]): Promise<Page<T>> {
    const filter = q
      ? { $or: searchFields.map((field) => ({ [field]: { $regex: escapeRegex(q), $options: 'i' } })) }
      : {};
    return this.findPage(tenantId, filter as Filter<T>, { page, pageSize }, { createdAt: 1, _id: 1 });
  }

  /** Cuántos de `ids` existen (activos) en el tenant. */
  async countExisting(tenantId: string, ids: readonly string[]): Promise<number> {
    return this.count(tenantId, { _id: { $in: [...ids] } } as Filter<T>);
  }
}

/** Lectura de existencias que necesitan los catálogos para impedir borrar un producto o almacén con stock. */
export class StockUsageRepository {
  public constructor(private readonly collection: Collection<StockLevelDocument>) {}

  async hasStock(tenantId: string, field: 'productId' | 'warehouseId', id: string): Promise<boolean> {
    const found = await this.collection.findOne(
      { tenantId, [field]: id, quantity: { $ne: Decimal128.fromString('0') } },
      { projection: { _id: 1 } },
    );
    return found !== null;
  }
}

export function catalogRepositories(db: Db) {
  const repository = <T extends CatalogDocument>(entity: CatalogEntity) =>
    new CatalogRepository<T>(db.collection<T>(CATALOG_COLLECTIONS[entity]));
  return {
    unit: repository<UnitDocument>('unit'),
    tax: repository<TaxDocument>('tax'),
    currency: repository<CurrencyDocument>('currency'),
    category: repository<CategoryDocument>('category'),
    product: repository<ProductDocument>('product'),
    customer: repository<PartyDocument>('customer'),
    supplier: repository<PartyDocument>('supplier'),
    warehouse: repository<WarehouseDocument>('warehouse'),
  };
}
export type CatalogRepositories = ReturnType<typeof catalogRepositories>;

export function stockUsageRepository(db: Db): StockUsageRepository {
  return new StockUsageRepository(db.collection<StockLevelDocument>(STOCK_LEVELS_COLLECTION));
}

/**
 * Los códigos (y el SKU) son únicos por tenant incluso entre registros borrados: un código dado de baja
 * no se reutiliza, para que el historial (kardex, auditoría) no se preste a confusión.
 */
export async function ensureCatalogsIndexes(db: Db): Promise<void> {
  const active = { key: { tenantId: 1, deletedAt: 1, createdAt: 1 }, name: 'tenant_active_created' };
  const uniqueCode = { key: { tenantId: 1, code: 1 }, name: 'tenant_code_unique', unique: true };
  for (const entity of ['unit', 'tax', 'currency', 'customer', 'supplier', 'warehouse'] as const) {
    await db.collection(CATALOG_COLLECTIONS[entity]).createIndexes([active, uniqueCode]);
  }
  await db.collection(CATALOG_COLLECTIONS.category).createIndexes([
    active,
    { key: { tenantId: 1, parentId: 1, name: 1 }, name: 'tenant_parent_name_unique', unique: true },
  ]);
  await db.collection(CATALOG_COLLECTIONS.product).createIndexes([
    active,
    { key: { tenantId: 1, sku: 1 }, name: 'tenant_sku_unique', unique: true },
    { key: { tenantId: 1, unitId: 1 }, name: 'tenant_unit' },
    { key: { tenantId: 1, categoryId: 1 }, name: 'tenant_category' },
    { key: { tenantId: 1, taxIds: 1 }, name: 'tenant_taxes' },
  ]);
}
