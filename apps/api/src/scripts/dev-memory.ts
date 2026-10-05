/**
 * API de demostración sobre una base MongoDB en memoria (réplica de un nodo, con transacciones como Atlas).
 * No toca Atlas ni envía correos: sirve para probar la web y la app sin cuentas externas.
 *
 *   pnpm --filter @erp/api dev:memory
 *
 * - Crea la empresa, las dos cuentas de `SEED_*` (las mismas variables que el seed) y los datos de construcción.
 * - Los datos se pierden al detener el proceso.
 * - En vez de enviar cada correo, imprime su asunto y su enlace en esta consola: el enlace lleva un token de un
 *   solo uso, por eso este modo es solo para desarrollo.
 */
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
import { ZodError } from 'zod';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { loadConfig } from '@erp/config';
import { closeDB, connectDB, getDatabase } from '../config/database';
import { RealtimeHub } from '../core/realtime';
import { createApp } from '../app';
import { ensureIndexes } from '../indexes';
import { identityRepositories } from '../modules/identity/identity.repository';
import { createIdentityService } from '../modules/identity/identity.routes';
import type { EmailSender } from '../platform/integrations/email';
import { seedConstruction } from './seed-construction';
import { SeedEnvSchema } from './seed-env';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env.local') });

const consoleEmailSender: EmailSender = {
  async send({ to, subject, text }) {
    const link = /https?:\/\/\S+/.exec(text)?.[0] ?? '(sin enlace)';
    console.log(`\n[correo no enviado] Para: ${to}\n  Asunto: ${subject}\n  Enlace: ${link}\n`);
  },
};

async function run(): Promise<void> {
  const seed = SeedEnvSchema.parse(process.env);
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'development',
    MONGODB_URI: replSet.getUri(),
    MONGODB_DB_NAME: 'erp-demo',
    // La base es nueva en cada arranque: un secreto efímero basta y no hay sesiones anteriores que conservar.
    JWT_SECRET: randomBytes(48).toString('base64'),
    DEFAULT_TENANT_ID: seed.SEED_TENANT_ID,
    RESEND_API_KEY: '',
  });

  await connectDB(config.mongodbUri, config.mongodbDbName);
  const db = getDatabase();
  await ensureIndexes(db);

  await identityRepositories(db).tenants.ensure(seed.SEED_TENANT_ID, seed.SEED_COMPANY_NAME);
  const identity = createIdentityService(db, config, { send: async () => undefined });
  const admin = await identity.createUser(
    { email: seed.SEED_ADMIN_EMAIL, name: seed.SEED_ADMIN_NAME, role: 'admin', password: seed.SEED_ADMIN_PASSWORD }, seed.SEED_TENANT_ID,
  );
  await identity.createUser(
    { email: seed.SEED_USER_EMAIL, name: seed.SEED_USER_NAME, role: 'user', password: seed.SEED_USER_PASSWORD }, seed.SEED_TENANT_ID,
  );
  await seedConstruction(db, seed.SEED_TENANT_ID, admin.id);

  const realtime = new RealtimeHub(config);
  const server = createApp(config, realtime.publish, consoleEmailSender).listen(config.port, () => {
    console.log(`API de demostración en http://localhost:${config.port} (base en memoria, correos a la consola)`);
    console.log(`Cuentas: ${seed.SEED_ADMIN_EMAIL} (admin) y ${seed.SEED_USER_EMAIL} (user), con las contraseñas de SEED_*`);
  });
  realtime.attach(server);

  const shutdown = () => {
    realtime.close();
    server.close(() => { void closeDB().then(() => replSet.stop()).finally(() => process.exit(0)); });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

run().catch((error) => {
  if (error instanceof ZodError) {
    for (const issue of error.issues) console.error(`Revisa ${String(issue.path[0])}: ${issue.message}`);
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exit(1);
});
