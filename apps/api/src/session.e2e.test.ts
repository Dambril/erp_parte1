import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { ApiClient, ApiError, memorySessionStore, mensajeError, type SessionStore, type SessionTokens } from '@erp/api-client';
import { permissionsForRole, type MeResponse } from '@erp/domain';
import { createApp } from './app';
import { getDatabase } from './config/database';
import { createIdentityService } from './modules/identity/identity.routes';
import { identityRepositories } from './modules/identity/identity.repository';
import type { EmailMessage } from './platform/integrations/email';
import { startDatabase, stopDatabase, testConfig, TEST_PASSWORD } from './test/helpers';

let replSet: MongoMemoryReplSet;
let server: Server;
let baseUrl: string;
const sent: EmailMessage[] = [];

/** Como la web: solo el refresh token sobrevive a una recarga. */
function refreshOnlyStore(): SessionStore & { saved: () => SessionTokens | null } {
  let saved: SessionTokens | null = null;
  return {
    load: async () => (saved ? { refreshToken: saved.refreshToken } : null),
    save: async (tokens) => { saved = tokens; },
    clear: async () => { saved = null; },
    saved: () => saved,
  };
}

beforeAll(async () => {
  replSet = await startDatabase();
  await identityRepositories(getDatabase()).tenants.ensure('tenant-s', 'Empresa S');
  const identity = createIdentityService(getDatabase(), testConfig, { send: async (message) => { sent.push(message); } });
  await identity.createUser({ email: 'user@example.com', name: 'Usuario', role: 'user', password: TEST_PASSWORD }, 'tenant-s');
  server = createApp(testConfig, undefined, { send: async (message) => { sent.push(message); } }).listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120_000);

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await stopDatabase(replSet);
});

it('logs in, loads /me with permissions and notifies listeners', async () => {
  const client = new ApiClient({ baseUrl });
  const seen: (MeResponse | null)[] = [];
  client.onSessionChange((me) => seen.push(me));

  const me = await client.login('user@example.com', TEST_PASSWORD);
  expect(me.company).toEqual({ id: 'tenant-s', name: 'Empresa S' });
  expect(me.permissions).toEqual(permissionsForRole('user'));
  expect(seen).toEqual([me]);
  expect(client.getMe()).toEqual(me);
});

it('maps login errors to the screen messages', async () => {
  const client = new ApiClient({ baseUrl });
  const error = await client.login('nadie@example.com', 'contraseña equivocada').catch((err: unknown) => err);
  expect(error).toBeInstanceOf(ApiError);
  expect(mensajeError(error)).toBe('Correo o contraseña incorrectos');

  const offline = await new ApiClient({ baseUrl: 'http://127.0.0.1:1' }).login('user@example.com', TEST_PASSWORD).catch((err: unknown) => err);
  expect((offline as ApiError).code).toBe('NETWORK_ERROR');
});

it('restores a session from the refresh token alone (web reload)', async () => {
  const store = refreshOnlyStore();
  await new ApiClient({ baseUrl, sessionStore: store }).login('user@example.com', TEST_PASSWORD);
  const firstRefresh = store.saved()!.refreshToken;

  const reloaded = new ApiClient({ baseUrl, sessionStore: store });
  const me = await reloaded.restoreSession();
  expect(me?.user.email).toBe('user@example.com');
  // Restaurar renovó el par: el refresh token anterior quedó revocado.
  expect(store.saved()!.refreshToken).not.toBe(firstRefresh);
});

it('renews once on a 401 and retries the request', async () => {
  const store = memorySessionStore();
  await new ApiClient({ baseUrl, sessionStore: store }).login('user@example.com', TEST_PASSWORD);
  const { refreshToken } = (await store.load())!;
  await store.save({ accessToken: 'expired-or-invalid', refreshToken });

  const client = new ApiClient({ baseUrl, sessionStore: store });
  expect((await client.restoreSession())?.user.email).toBe('user@example.com');
  expect(client.getSession()!.accessToken).not.toBe('expired-or-invalid');
});

it('closes the session when the renewal fails', async () => {
  const store = memorySessionStore();
  await store.save({ accessToken: 'expired-or-invalid', refreshToken: 'revoked-or-invented' });
  const client = new ApiClient({ baseUrl, sessionStore: store });

  await expect(client.restoreSession()).resolves.toBeNull();
  expect(client.getSession()).toBeNull();
  expect(await store.load()).toBeNull();
});

it('logout revokes the session in the API and clears local tokens', async () => {
  const store = memorySessionStore();
  const client = new ApiClient({ baseUrl, sessionStore: store });
  await client.login('user@example.com', TEST_PASSWORD);
  const { refreshToken } = client.getSession()!;
  const seen: (MeResponse | null)[] = [];
  client.onSessionChange((me) => seen.push(me));

  await client.logout();
  expect(seen).toEqual([null]);
  expect(await store.load()).toBeNull();
  const reuse = await fetch(`${baseUrl}/auth/refresh`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }),
  });
  expect(reuse.status).toBe(401);
});

it('recovers the password end to end and logs in with the new one', async () => {
  const client = new ApiClient({ baseUrl });
  sent.length = 0;
  await client.forgotPassword('user@example.com');
  const token = /\/restablecer\?token=([A-Za-z0-9_-]+)/.exec(sent[0]!.text)![1]!;

  const invalid = await client.resetPassword({ token: 'inventado', password: 'una frase nueva y bastante larga' }).catch((err: unknown) => err);
  expect(mensajeError(invalid)).toBe('El enlace no es válido o ya venció. Solicita uno nuevo.');

  await client.resetPassword({ token, password: 'una frase nueva y bastante larga' });
  expect((await client.login('user@example.com', 'una frase nueva y bastante larga')).user.email).toBe('user@example.com');
});
