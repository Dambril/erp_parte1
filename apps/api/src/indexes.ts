import type { Db } from 'mongodb';
import { ensureAuditIndexes } from './core/audit';
import { ensureCatalogsIndexes } from './modules/catalogs/catalogs.repository';
import { ensureIdentityIndexes, migrateIdentityDocuments } from './modules/identity/identity.repository';
import { ensureInventoryIndexes } from './modules/inventory/inventory.repository';
import { ensureObrasIndexes } from './modules/obras/obras.repository';

/**
 * Crea (idempotente) todos los índices de la API y aplica las migraciones de datos pendientes, también idempotentes.
 * Se ejecuta en cada arranque y en los scripts; nunca a mano en Atlas.
 */
export async function ensureIndexes(db: Db): Promise<void> {
  await ensureIdentityIndexes(db);
  await migrateIdentityDocuments(db);
  await ensureAuditIndexes(db);
  await ensureCatalogsIndexes(db);
  await ensureInventoryIndexes(db);
  await ensureObrasIndexes(db);
}
