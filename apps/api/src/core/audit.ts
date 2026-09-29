import { randomUUID } from 'node:crypto';
import type { ClientSession, Collection, Db } from 'mongodb';

export const AUDIT_LOGS_COLLECTION = 'audit_logs';

export type AuditAction = 'create' | 'update' | 'delete';

/** Bitácora inmutable: quién (`actorId`), qué (`action` sobre `entity`/`entityId`, con estado antes y después) y cuándo. */
export interface AuditLogDocument {
  _id: string;
  tenantId: string;
  actorId: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
  occurredAt: Date;
}

export type AuditEntry = Omit<AuditLogDocument, '_id' | 'occurredAt'>;

/** Solo inserta y consulta: no existe forma de modificar ni borrar un registro de auditoría desde la aplicación. */
export class AuditLogRepository {
  public constructor(private readonly collection: Collection<AuditLogDocument>) {}

  async record(entry: AuditEntry, session?: ClientSession): Promise<void> {
    if (!entry.tenantId) throw new Error('tenantId is required for audit entries');
    await this.collection.insertOne({ ...entry, _id: randomUUID(), occurredAt: new Date() }, { session });
  }

  async findByEntity(tenantId: string, entity: string, entityId: string): Promise<AuditLogDocument[]> {
    return this.collection.find({ tenantId, entity, entityId }).sort({ occurredAt: 1 }).toArray();
  }
}

export function auditRepository(db: Db): AuditLogRepository {
  return new AuditLogRepository(db.collection<AuditLogDocument>(AUDIT_LOGS_COLLECTION));
}

export async function ensureAuditIndexes(db: Db): Promise<void> {
  await db.collection(AUDIT_LOGS_COLLECTION).createIndexes([
    { key: { tenantId: 1, entity: 1, entityId: 1, occurredAt: -1 }, name: 'tenant_entity_time' },
    { key: { tenantId: 1, occurredAt: -1 }, name: 'tenant_time' },
  ]);
}
