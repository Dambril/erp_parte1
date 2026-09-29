/**
 * Crea un usuario administrador (el primero de un tenant, o cualquiera sin pasar por la API).
 *
 *   $env:ADMIN_PASSWORD = '...'   # PowerShell; la contraseña no va como argumento para no quedar en el historial
 *   pnpm --filter @erp/api create-admin -- --email admin@empresa.com --name "Admin" [--tenant t-001] [--role superadmin]
 *
 * Usa el MONGODB_URI de .env.local: si apunta a Atlas de producción, el usuario se crea en producción.
 */
import path from 'node:path';
import { parseArgs } from 'node:util';
import dotenv from 'dotenv';
import { loadConfig } from '@erp/config';
import { CreateUserRequestSchema } from '@erp/domain';
import { closeDB, connectDB, getDatabase } from '../config/database';
import { ensureIdentityIndexes, identityRepositories } from '../modules/identity/identity.repository';
import { IdentityService } from '../modules/identity/identity.service';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env.local') });

async function run(): Promise<void> {
  const config = loadConfig();
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      tenant: { type: 'string', default: config.defaultTenantId },
      role: { type: 'string', default: 'admin' },
    },
  });
  if (values.role !== 'admin' && values.role !== 'superadmin') throw new Error('--role must be admin or superadmin');

  const input = CreateUserRequestSchema.parse({
    email: values.email, name: values.name, role: values.role, password: process.env.ADMIN_PASSWORD,
  });

  await connectDB(config.mongodbUri, config.mongodbDbName);
  try {
    const db = getDatabase();
    await ensureIdentityIndexes(db);
    const { users, refreshTokens } = identityRepositories(db);
    const user = await new IdentityService(users, refreshTokens, config).createUser(input, values.tenant);
    console.log(`Usuario creado: ${user.email} (${user.role}) en el tenant ${user.tenantId}`);
  } finally {
    await closeDB();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
