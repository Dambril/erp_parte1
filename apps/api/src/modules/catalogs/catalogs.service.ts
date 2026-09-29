import { MongoServerError } from 'mongodb';
import type { Paginated, PaginationQuery } from '@erp/domain';
import type { AuditLogRepository } from '../../core/audit';
import { toDecimal128 } from '../../core/decimal';
import { HttpError } from '../../core/http-error';
import { toApiDocument, type ApiDocument } from '../../core/repository';
import type {
  CatalogDocument, CatalogEntity, CatalogRepositories, CatalogRepository, StockUsageRepository,
} from './catalogs.repository';

export interface ActionContext {
  tenantId: string;
  actorId: string;
}

type Fields = Record<string, unknown>;
type CatalogRecord = ApiDocument<CatalogDocument>;

interface EntityRules {
  searchFields: readonly string[];
  /** Valida referencias y convierte la entrada (ya validada por Zod) a campos persistidos. `currentId` solo al actualizar. */
  prepare?(input: Fields, tenantId: string, currentId?: string): Promise<Fields>;
  /** Lanza si el registro no puede darse de baja. */
  beforeDelete?(id: string, tenantId: string): Promise<void>;
}

const MAX_CATEGORY_DEPTH = 50;

const label = (entity: CatalogEntity) => entity.toUpperCase();
const notFound = (entity: CatalogEntity) => new HttpError(404, `${label(entity)}_NOT_FOUND`, `${entity} not found`);
const inUse = (entity: CatalogEntity, reason: string) => new HttpError(409, `${label(entity)}_IN_USE`, `${entity} cannot be deleted: ${reason}`);
const invalidReference = (field: string) => new HttpError(400, 'INVALID_REFERENCE', `${field} does not exist in this tenant`);

function convertDecimals(input: Fields, fields: readonly string[]): Fields {
  const output = { ...input };
  for (const field of fields) {
    if (typeof output[field] === 'string') output[field] = toDecimal128(output[field] as string);
  }
  return output;
}

export class CatalogsService {
  private readonly rules: Record<CatalogEntity, EntityRules>;

  public constructor(
    private readonly repositories: CatalogRepositories,
    private readonly stockUsage: StockUsageRepository,
    private readonly audit: AuditLogRepository,
  ) {
    const codeAndName = ['code', 'name'] as const;
    const party = ['code', 'legalName', 'taxId'] as const;
    this.rules = {
      unit: {
        searchFields: codeAndName,
        beforeDelete: async (id, tenantId) => {
          if (await repositories.product.count(tenantId, { unitId: id })) throw inUse('unit', 'products use it');
        },
      },
      tax: {
        searchFields: codeAndName,
        prepare: async (input) => convertDecimals(input, ['rate']),
        beforeDelete: async (id, tenantId) => {
          if (await repositories.product.count(tenantId, { taxIds: id })) throw inUse('tax', 'products use it');
        },
      },
      currency: {
        searchFields: codeAndName,
        beforeDelete: async (id, tenantId) => {
          if (await repositories.product.count(tenantId, { currencyId: id })) throw inUse('currency', 'products use it');
        },
      },
      category: {
        searchFields: ['name'],
        prepare: async (input, tenantId, currentId) => {
          if (typeof input.parentId === 'string') await this.assertValidParent(input.parentId, tenantId, currentId);
          return input;
        },
        beforeDelete: async (id, tenantId) => {
          if (await repositories.category.count(tenantId, { parentId: id })) throw inUse('category', 'it has subcategories');
          if (await repositories.product.count(tenantId, { categoryId: id })) throw inUse('category', 'products use it');
        },
      },
      product: {
        searchFields: ['sku', 'name'],
        prepare: async (input, tenantId) => {
          await this.assertExists('unit', input.unitId, tenantId, 'unitId');
          await this.assertExists('category', input.categoryId, tenantId, 'categoryId');
          await this.assertExists('currency', input.currencyId, tenantId, 'currencyId');
          if (Array.isArray(input.taxIds)) {
            const taxIds = [...new Set(input.taxIds as string[])];
            if (await repositories.tax.countExisting(tenantId, taxIds) !== taxIds.length) throw invalidReference('taxIds');
            input = { ...input, taxIds };
          }
          return convertDecimals(input, ['cost', 'salePrice']);
        },
        beforeDelete: async (id, tenantId) => {
          if (await stockUsage.hasStock(tenantId, 'productId', id)) throw inUse('product', 'it has stock');
        },
      },
      customer: { searchFields: party },
      supplier: { searchFields: party },
      warehouse: {
        searchFields: codeAndName,
        beforeDelete: async (id, tenantId) => {
          if (await stockUsage.hasStock(tenantId, 'warehouseId', id)) throw inUse('warehouse', 'it has stock');
        },
      },
    };
  }

  private repository(entity: CatalogEntity): CatalogRepository<CatalogDocument> {
    return this.repositories[entity] as unknown as CatalogRepository<CatalogDocument>;
  }

  /** `id` ausente o `null` no se valida (referencia opcional). */
  private async assertExists(entity: CatalogEntity, id: unknown, tenantId: string, field: string): Promise<void> {
    if (typeof id !== 'string') return;
    if (!(await this.repository(entity).findById(id, tenantId))) throw invalidReference(field);
  }

  /** El padre debe existir y no puede ser la propia categoría ni una de sus descendientes. */
  private async assertValidParent(parentId: string, tenantId: string, currentId?: string): Promise<void> {
    let cursor: string | null = parentId;
    for (let depth = 0; cursor; depth++) {
      if (cursor === currentId) throw new HttpError(409, 'CATEGORY_CYCLE', 'A category cannot be its own ancestor');
      if (depth >= MAX_CATEGORY_DEPTH) throw new HttpError(409, 'CATEGORY_TOO_DEEP', 'Category hierarchy is too deep');
      const parent: { parentId: string | null } | null = await this.repositories.category.findById(cursor, tenantId);
      if (!parent) throw invalidReference('parentId');
      cursor = parent.parentId;
    }
  }

  private async prepare(entity: CatalogEntity, input: Fields, tenantId: string, currentId?: string): Promise<Fields> {
    const prepare = this.rules[entity].prepare;
    return prepare ? prepare(input, tenantId, currentId) : input;
  }

  private static duplicate(entity: CatalogEntity, error: unknown): never {
    if (error instanceof MongoServerError && error.code === 11000) {
      const field = entity === 'product' ? 'sku' : entity === 'category' ? 'name under this parent' : 'code';
      throw new HttpError(409, `${label(entity)}_ALREADY_EXISTS`, `A ${entity} with this ${field} already exists`);
    }
    throw error;
  }

  async list(entity: CatalogEntity, tenantId: string, query: PaginationQuery): Promise<Paginated<CatalogRecord>> {
    const page = await this.repository(entity).search(tenantId, query, this.rules[entity].searchFields);
    return { ...page, items: page.items.map(toApiDocument) };
  }

  async get(entity: CatalogEntity, id: string, tenantId: string): Promise<CatalogRecord> {
    const document = await this.repository(entity).findById(id, tenantId);
    if (!document) throw notFound(entity);
    return toApiDocument(document);
  }

  async create(entity: CatalogEntity, input: Fields, { tenantId, actorId }: ActionContext): Promise<CatalogRecord> {
    const fields = await this.prepare(entity, input, tenantId);
    let created: CatalogDocument;
    try {
      created = await this.repository(entity).insert(fields, tenantId);
    } catch (error) {
      CatalogsService.duplicate(entity, error);
    }
    const after = toApiDocument(created);
    await this.audit.record({ tenantId, actorId, action: 'create', entity, entityId: created._id, before: null, after });
    return after;
  }

  async update(entity: CatalogEntity, id: string, input: Fields, { tenantId, actorId }: ActionContext): Promise<CatalogRecord> {
    const before = await this.get(entity, id, tenantId);
    const fields = await this.prepare(entity, input, tenantId, id);
    let updated: CatalogDocument | null;
    try {
      updated = await this.repository(entity).updateById(id, tenantId, fields);
    } catch (error) {
      CatalogsService.duplicate(entity, error);
    }
    if (!updated) throw notFound(entity);
    const after = toApiDocument(updated);
    await this.audit.record({ tenantId, actorId, action: 'update', entity, entityId: id, before, after });
    return after;
  }

  async remove(entity: CatalogEntity, id: string, { tenantId, actorId }: ActionContext): Promise<void> {
    const before = await this.get(entity, id, tenantId);
    await this.rules[entity].beforeDelete?.(id, tenantId);
    if (!(await this.repository(entity).softDeleteById(id, tenantId))) throw notFound(entity);
    await this.audit.record({ tenantId, actorId, action: 'delete', entity, entityId: id, before, after: null });
  }
}
