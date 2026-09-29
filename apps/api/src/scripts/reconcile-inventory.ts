/**
 * Recalcula las existencias desde los movimientos y las compara con `stock_levels`. Solo reporta; no corrige.
 *
 *   pnpm --filter @erp/api reconcile-inventory -- [--tenant t-001]
 *
 * Sale con código 2 si hay diferencias. Usa el MONGODB_URI de .env.local.
 */
import path from 'node:path';
import { parseArgs } from 'node:util';
import dotenv from 'dotenv';
import { loadConfig } from '@erp/config';
import { closeDB, connectDB, getDatabase } from '../config/database';
import { auditRepository } from '../core/audit';
import { catalogRepositories } from '../modules/catalogs/catalogs.repository';
import { inventoryRepositories } from '../modules/inventory/inventory.repository';
import { InventoryService } from '../modules/inventory/inventory.service';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env.local') });

async function run(): Promise<number> {
  const config = loadConfig();
  // pnpm reenvía el `--` separador literalmente; se descarta.
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  const { values } = parseArgs({ args, options: { tenant: { type: 'string', default: config.defaultTenantId } } });

  await connectDB(config.mongodbUri, config.mongodbDbName);
  try {
    const db = getDatabase();
    const service = new InventoryService(inventoryRepositories(db), catalogRepositories(db), auditRepository(db));
    const report = await service.reconcile(values.tenant);
    console.log(`Tenant ${report.tenantId}: ${report.balancesChecked} existencias revisadas, ${report.differences.length} diferencias`);
    for (const difference of report.differences) {
      console.log(`  producto ${difference.productId} almacén ${difference.warehouseId} lote ${difference.lotId ?? '-'}: `
        + `movimientos=${difference.expected} stock_levels=${difference.actual}`);
    }
    return report.differences.length > 0 ? 2 : 0;
  } finally {
    await closeDB();
  }
}

run().then((code) => process.exit(code)).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
