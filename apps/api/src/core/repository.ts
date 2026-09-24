import type { Collection, Filter, OptionalUnlessRequiredId, Document } from 'mongodb';

export interface TenantScopedDocument extends Document {
  tenantId: string;
  deletedAt?: Date | null;
}

export class TenantRepository<T extends TenantScopedDocument> {
  public constructor(private readonly collection: Collection<T>) {}

  private requireTenant(tenantId: string | undefined): string {
    if (!tenantId) throw new Error('tenantId is required for repository queries');
    return tenantId;
  }

  async findById(id: string, tenantId?: string): Promise<T | null> {
    const scopedTenantId = this.requireTenant(tenantId);
    return this.collection.findOne({ _id: id, tenantId: scopedTenantId, deletedAt: null } as Filter<T>);
  }

  async insert(document: OptionalUnlessRequiredId<T>, tenantId?: string): Promise<void> {
    const scopedTenantId = this.requireTenant(tenantId);
    if (document.tenantId !== scopedTenantId) throw new Error('Document tenantId does not match query tenantId');
    await this.collection.insertOne(document);
  }
}
