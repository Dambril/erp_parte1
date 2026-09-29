import { randomUUID } from 'node:crypto';
import type { Collection, Filter, OptionalUnlessRequiredId, Document, UpdateFilter } from 'mongodb';

/**
 * Forma persistida de todo documento de negocio (ver ADR 0001):
 * `_id` es un UUID en texto y las fechas son `Date` nativas de Mongo.
 * Hacia la API se expone con `toApiDocument`: `id` y fechas ISO (BaseDocumentSchema de @erp/domain).
 */
export interface TenantScopedDocument extends Document {
  _id: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

type ApiValue<V> = V extends Date ? string : V extends Date | null ? string | null : V;
// Se descartan `_id` y la firma de índice heredada de `Document` para conservar solo los campos declarados.
export type ApiDocument<T extends TenantScopedDocument> = { id: string } & {
  [K in keyof T as K extends '_id' ? never : string extends K ? never : number extends K ? never : K]: ApiValue<T[K]>;
};

/** Convierte un documento persistido a su representación JSON de la API. */
export function toApiDocument<T extends TenantScopedDocument>(document: T): ApiDocument<T> {
  const { _id, ...rest } = document;
  const output: Record<string, unknown> = { id: _id };
  for (const [key, value] of Object.entries(rest)) {
    output[key] = value instanceof Date ? value.toISOString() : value;
  }
  return output as ApiDocument<T>;
}

/** Campos que el repositorio gestiona por sí mismo al insertar. */
export type NewDocument<T extends TenantScopedDocument> = Omit<T, '_id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export class TenantRepository<T extends TenantScopedDocument> {
  public constructor(protected readonly collection: Collection<T>) {}

  protected requireTenant(tenantId: string | undefined): string {
    if (!tenantId) throw new Error('tenantId is required for repository queries');
    return tenantId;
  }

  /** Filtro base: siempre acotado al tenant y excluyendo borrados lógicos. */
  protected scoped(tenantId: string | undefined, filter: Filter<T> = {}): Filter<T> {
    return { ...filter, tenantId: this.requireTenant(tenantId), deletedAt: null } as Filter<T>;
  }

  async findById(id: string, tenantId?: string): Promise<T | null> {
    return (await this.collection.findOne(this.scoped(tenantId, { _id: id } as Filter<T>))) as T | null;
  }

  async findMany(tenantId: string | undefined, filter: Filter<T> = {}, limit = 100): Promise<T[]> {
    return (await this.collection.find(this.scoped(tenantId, filter)).limit(limit).toArray()) as T[];
  }

  async insert(document: NewDocument<T>, tenantId?: string): Promise<T> {
    const now = new Date();
    const full = {
      ...document,
      _id: randomUUID(),
      tenantId: this.requireTenant(tenantId),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    } as unknown as T;
    await this.collection.insertOne(full as OptionalUnlessRequiredId<T>);
    return full;
  }

  async updateById(id: string, tenantId: string | undefined, changes: Partial<NewDocument<T>>): Promise<T | null> {
    return (await this.collection.findOneAndUpdate(
      this.scoped(tenantId, { _id: id } as Filter<T>),
      { $set: { ...changes, updatedAt: new Date() } } as UpdateFilter<T>,
      { returnDocument: 'after' },
    )) as T | null;
  }

  async softDeleteById(id: string, tenantId?: string): Promise<boolean> {
    const result = await this.collection.updateOne(
      this.scoped(tenantId, { _id: id } as Filter<T>),
      { $set: { deletedAt: new Date(), updatedAt: new Date() } } as UpdateFilter<T>,
    );
    return result.modifiedCount === 1;
  }
}
