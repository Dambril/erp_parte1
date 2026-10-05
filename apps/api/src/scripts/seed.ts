/**
 * Prepara una empresa con su administrador y un usuario para poder iniciar sesión, y carga las obras y
 * propuestas de demostración del módulo de construcción. Idempotente: la empresa y las cuentas que ya existen
 * (por correo) no se modifican, y los datos de construcción solo se cargan si el tenant no tiene ninguno.
 *
 *   pnpm --filter @erp/api seed
 *
 * Toma todo de variables de entorno (normalmente de .env.local; ver .env.example), nunca de argumentos,
 * para que las contraseñas no queden en el historial: SEED_TENANT_ID, SEED_COMPANY_NAME,
 * SEED_ADMIN_EMAIL/NAME/PASSWORD y SEED_USER_EMAIL/NAME/PASSWORD.
 *
 * Usa el MONGODB_URI de .env.local: si apunta a Atlas de producción, las cuentas se crean en producción.
 */
import path from 'node:path';
import dotenv from 'dotenv';
import { ZodError } from 'zod';
import { loadConfig } from '@erp/config';
import { CreateUserRequestSchema, type Role } from '@erp/domain';
import { closeDB, connectDB, getDatabase } from '../config/database';
import { ensureIndexes } from '../indexes';
import { identityRepositories } from '../modules/identity/identity.repository';
import { createIdentityService } from '../modules/identity/identity.routes';
import { NoopEmailSender } from '../platform/integrations/email';
import { SEED_CONSTRUCTION_SUMMARY, seedConstruction } from './seed-construction';
import { SeedEnvSchema } from './seed-env';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env.local') });

async function run(): Promise<void> {
  const config = loadConfig();
  const env = SeedEnvSchema.parse(process.env);
  const tenantId = env.SEED_TENANT_ID;
  const accounts: { label: string; role: Role; email: string; name: string; password: string }[] = [
    { label: 'SEED_ADMIN', role: 'admin', email: env.SEED_ADMIN_EMAIL, name: env.SEED_ADMIN_NAME, password: env.SEED_ADMIN_PASSWORD },
    { label: 'SEED_USER', role: 'user', email: env.SEED_USER_EMAIL, name: env.SEED_USER_NAME, password: env.SEED_USER_PASSWORD },
  ];
  // Se valida todo antes de tocar la base, con el mismo esquema que la API (contraseña de 15 a 128 caracteres).
  const inputs = accounts.map(({ label, role, email, name, password }) => {
    try {
      return CreateUserRequestSchema.parse({ email, name, role, password });
    } catch (error) {
      if (error instanceof ZodError) throw new Error(error.issues.map((issue) => `${label}_${String(issue.path[0]).toUpperCase()}: ${issue.message}`).join('\n'));
      throw error;
    }
  });

  await connectDB(config.mongodbUri, config.mongodbDbName);
  const db = getDatabase();
  await ensureIndexes(db);
  const { users, tenants } = identityRepositories(db);
  const service = createIdentityService(db, config, new NoopEmailSender());

  const created = await tenants.ensure(tenantId, env.SEED_COMPANY_NAME);
  console.log(created ? `Empresa creada: ${env.SEED_COMPANY_NAME} (${tenantId})` : `La empresa ${tenantId} ya existía; no se modificó.`);

  for (const input of inputs) {
    const existing = await users.findByEmailAcrossTenants(input.email);
    if (existing) {
      console.log(`El usuario ${input.email} ya existía (tenant ${existing.tenantId}); no se modificó.`);
      continue;
    }
    const user = await service.createUser(input, tenantId);
    console.log(`Usuario creado: ${user.email} (${user.role}) en el tenant ${user.tenantId}`);
  }

  // Las obras de demostración quedan a nombre del administrador del seed.
  const admin = await users.findByEmailAcrossTenants(inputs[0].email);
  if (!admin || admin.tenantId !== tenantId) {
    console.log(`El administrador ${inputs[0].email} no pertenece al tenant ${tenantId}; no se cargaron datos de construcción.`);
  } else if (await seedConstruction(db, tenantId, admin._id)) {
    console.log(`Construcción: se cargaron ${SEED_CONSTRUCTION_SUMMARY}.`);
  } else {
    console.log('Construcción: el tenant ya tenía obras o propuestas; no se cargó nada.');
  }
}

run()
  .catch((error) => {
    if (error instanceof ZodError) {
      for (const issue of error.issues) console.error(`Revisa ${String(issue.path[0])}: ${issue.message}`);
    } else {
      console.error(error instanceof Error ? error.message : error);
    }
    process.exitCode = 1;
  })
  .finally(() => closeDB());
