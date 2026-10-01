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
import { ZodError } from 'zod';
import { loadConfig } from '@erp/config';
import { CreateUserRequestSchema } from '@erp/domain';
import { closeDB, connectDB, getDatabase } from '../config/database';
import { ensureIndexes } from '../indexes';
import { identityRepositories } from '../modules/identity/identity.repository';
import { IdentityService } from '../modules/identity/identity.service';
import { NoopMailer } from '../platform/integrations/email';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env.local') });

async function run(): Promise<void> {
  const config = loadConfig();
  // pnpm reenvía el `--` separador literalmente (`pnpm ... create-admin -- --email x`); se descarta.
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  const { values } = parseArgs({
    args,
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
    await ensureIndexes(db);
    const { users, refreshTokens, passwordResets } = identityRepositories(db);
    const user = await new IdentityService(users, refreshTokens, config, passwordResets, new NoopMailer()).createUser(input, values.tenant);
    console.log(`Usuario creado: ${user.email} (${user.role}) en el tenant ${user.tenantId}`);
  } finally {
    await closeDB();
  }
}

const FIELD_HINTS: Record<string, string> = {
  email: '--email',
  name: '--name',
  role: '--role',
  password: 'la variable de entorno ADMIN_PASSWORD (mínimo 8 caracteres)',
};

run().catch((error) => {
  if (error instanceof ZodError) {
    for (const issue of error.issues) {
      const field = String(issue.path[0]);
      console.error(`Revisa ${FIELD_HINTS[field] ?? field}: ${issue.message}`);
    }
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exit(1);
});
