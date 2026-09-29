import type { Router } from 'express';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { Role } from '@erp/domain';
import type { ServerConfig } from '@erp/config';
import { createApp } from '../app';
import { closeDB, connectDB, getDatabase } from '../config/database';
import { ensureIndexes } from '../indexes';
import { identityRepositories } from '../modules/identity/identity.repository';
import { IdentityService } from '../modules/identity/identity.service';

export const testConfig = {
  nodeEnv: 'test',
  port: 0,
  mongodbUri: 'set-in-beforeAll',
  jwtSecret: 'test-access-secret',
  jwtExpiresIn: '15m',
  jwtRefreshSecret: 'test-refresh-secret',
  jwtRefreshExpiresIn: '7d',
  defaultTenantId: 'tenant-a',
  corsOrigins: [],
} satisfies ServerConfig;

export const TEST_PASSWORD = 'correct-horse-battery';

/**
 * Base real en memoria con replica set de un nodo: las transacciones de Mongo solo existen en replica sets,
 * así que las pruebas de inventario ejercitan el mismo camino que Atlas.
 */
export async function startDatabase(): Promise<MongoMemoryReplSet> {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await connectDB(replSet.getUri(), 'erp-test');
  await ensureIndexes(getDatabase());
  return replSet;
}

export async function stopDatabase(replSet: MongoMemoryReplSet | undefined): Promise<void> {
  await closeDB();
  await replSet?.stop();
}

/** Crea el usuario y devuelve su access token (el login pasa por la API real). */
export async function createUserAndLogin(email: string, role: Role, tenantId: string): Promise<string> {
  const { users, refreshTokens } = identityRepositories(getDatabase());
  await new IdentityService(users, refreshTokens, testConfig).createUser({ email, name: email, role, password: TEST_PASSWORD }, tenantId);
  const response = await request(createApp(testConfig)).post('/auth/login').send({ email, password: TEST_PASSWORD });
  if (response.status !== 200) throw new Error(`Login failed for ${email}: ${response.status}`);
  return response.body.data.accessToken as string;
}

/** Rutas registradas en un router de Express como `"get /path"` (para verificar cobertura de permisos). */
export function listRoutes(router: Router): string[] {
  const { stack } = router as unknown as { stack: { route?: { path: string; methods: Record<string, boolean> } }[] };
  return stack
    .filter((layer) => layer.route)
    .flatMap(({ route }) => Object.keys(route!.methods).map((method) => `${method} ${route!.path}`));
}

/** Cliente Supertest autenticado. Cada llamada crea una app nueva para no acumular el rate limit global. */
export function api(token: string) {
  const app = createApp(testConfig);
  const auth = { Authorization: `Bearer ${token}` };
  return {
    get: (path: string) => request(app).get(path).set(auth),
    post: (path: string, body: object = {}) => request(app).post(path).set(auth).send(body),
    patch: (path: string, body: object = {}) => request(app).patch(path).set(auth).send(body),
    put: (path: string, body: object = {}) => request(app).put(path).set(auth).send(body),
    delete: (path: string) => request(app).delete(path).set(auth),
  };
}
