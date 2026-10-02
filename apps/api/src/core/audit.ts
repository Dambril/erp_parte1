import { randomUUID } from 'node:crypto';
import type { ClientSession, Collection, Db } from 'mongodb';

// ── Bitácora de catálogos, inventario e identidad (`audit_logs`) ───

export const AUDIT_LOGS_COLLECTION = 'audit_logs';

export type AuditAction = 'create' | 'update' | 'delete' | 'password_reset' | 'invitation_accepted';

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

// ── Bitácora del módulo de obras (`audit_log`) ─────────────────────
// Se conserva separada para no mezclar formatos con el historial ya registrado; unificarlas requeriría migrar datos.

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
  await db.collection(AUDIT_LOGS_COLLECTION).createIndexes([
    { key: { tenantId: 1, entity: 1, entityId: 1, occurredAt: -1 }, name: 'tenant_entity_time' },
    { key: { tenantId: 1, occurredAt: -1 }, name: 'tenant_time' },
  ]);
  await db.collection(AUDIT_COLLECTION).createIndexes([
    { key: { tenantId: 1, entity: 1, entityId: 1, occurredAt: -1 }, name: 'tenant_entity' },
  ]);
}
