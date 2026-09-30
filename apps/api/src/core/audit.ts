import { randomUUID } from 'node:crypto';
import type { Collection, Db } from 'mongodb';

export const AUDIT_COLLECTION = 'audit_log';

export interface AuditEvent {
  tenantId: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  /** Datos relevantes del cambio (lo enviado por el usuario, la transición, etc.). */
  details?: Record<string, unknown>;
}

interface AuditDocument extends AuditEvent {
  _id: string;
  occurredAt: Date;
}

/** Registro de solo inserción: quién hizo qué, sobre qué entidad y cuándo. */
export class AuditLog {
  public constructor(private readonly collection: Collection<AuditDocument>) {}

  async record(event: AuditEvent): Promise<void> {
    await this.collection.insertOne({ ...event, _id: randomUUID(), occurredAt: new Date() });
  }
}

export function auditLog(db: Db): AuditLog {
  return new AuditLog(db.collection<AuditDocument>(AUDIT_COLLECTION));
}

export async function ensureAuditIndexes(db: Db): Promise<void> {
  await db.collection(AUDIT_COLLECTION).createIndexes([
    { key: { tenantId: 1, entity: 1, entityId: 1, occurredAt: -1 }, name: 'tenant_entity' },
  ]);
}
