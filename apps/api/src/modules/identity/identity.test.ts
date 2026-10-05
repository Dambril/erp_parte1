import request from 'supertest';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { permissionsForRole, type Role, type UserStatus } from '@erp/domain';
import { createApp } from '../../app';
import { getDatabase } from '../../config/database';
import { AUDIT_LOGS_COLLECTION } from '../../core/audit';
import { startDatabase, stopDatabase, testConfig as config } from '../../test/helpers';
import type { EmailMessage, EmailSender } from '../../platform/integrations/email';
import { hashPassword } from './password';
import { generateOpaqueToken, hashToken } from './tokens';
import {
  AUTH_TOKENS_COLLECTION, identityRepositories, migrateIdentityDocuments, SESSIONS_COLLECTION, USERS_COLLECTION, type AuthTokenType,
} from './identity.repository';
import { createIdentityService } from './identity.routes';
import { FORGOT_PASSWORD_MESSAGE } from './identity.controller';

const PASSWORD = 'correct-horse-battery';
const NEW_PASSWORD = 'una frase nueva y bastante larga';
let replSet: MongoMemoryReplSet;
let app: ReturnType<typeof createApp>;
const sent: EmailMessage[] = [];
const emailSender: EmailSender = { send: async (message) => { sent.push(message); } };

async function seedUser(email: string, role: Role, tenantId: string) {
  return createIdentityService(getDatabase(), config, emailSender).createUser({ email, name: email, role, password: PASSWORD }, tenantId);
}

/** Usuario con un estado concreto, sin pasar por el servicio (las invitaciones se emiten en el Bloque 3). */
async function insertUser(email: string, status: UserStatus, tenantId = 'tenant-a') {
  return identityRepositories(getDatabase()).users.insert({
    email, name: email, role: 'user', status,
    passwordHash: status === 'invited' ? null : await hashPassword(PASSWORD),
    failedLoginCount: 0, lockedUntil: null, custom: {},
  }, tenantId);
}

async function insertAuthToken(userId: string, type: AuthTokenType, expiresAt = new Date(Date.now() + 60_000), tenantId = 'tenant-a') {
  const token = generateOpaqueToken();
  await identityRepositories(getDatabase()).authTokens.createForUser({ tenantId, userId, type, tokenHash: hashToken(token), expiresAt });
  return token;
}

async function login(email: string, password = PASSWORD) {
  const response = await request(app).post('/auth/login').send({ email, password });
  expect(response.status).toBe(200);
  return response.body.data as { accessToken: string; refreshToken: string };
}

const loginAttempt = (email: string, password: string) => request(app).post('/auth/login').send({ email, password });
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
/** Respuesta sin la marca de tiempo, que cambia en cada petición. */
const comparable = (response: request.Response) => ({ status: response.status, body: { ...response.body, timestamp: undefined } });
const tokenFromEmail = (message: EmailMessage) => /\/restablecer\?token=([A-Za-z0-9_-]+)/.exec(message.text)![1]!;

beforeAll(async () => {
  replSet = await startDatabase();
  await identityRepositories(getDatabase()).tenants.ensure('tenant-a', 'Constructora A');
  await seedUser('admin-a@example.com', 'admin', 'tenant-a');
  await seedUser('viewer-a@example.com', 'viewer', 'tenant-a');
  await seedUser('admin-b@example.com', 'admin', 'tenant-b');
}, 120_000);

// App nueva por test: el rate limit por IP cuenta por instancia y aquí se hacen muchos logins.
beforeEach(() => {
  sent.length = 0;
  app = createApp(config, undefined, emailSender);
});

afterAll(async () => {
  await stopDatabase(replSet);
});

describe('POST /auth/login', () => {
  it('returns tokens and the public user, never the password hash', async () => {
    const response = await loginAttempt('ADMIN-A@example.com ', PASSWORD);
    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.refreshToken).toEqual(expect.any(String));
    expect(response.body.data.user).toMatchObject({ email: 'admin-a@example.com', role: 'admin', status: 'active', tenantId: 'tenant-a' });
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(response.body.data.user.failedLoginCount).toBeUndefined();
    expect(response.body.data.user._id).toBeUndefined();
  });

  it('puts sub, tenantId and role in a 15-minute access token', async () => {
    const { accessToken } = await login('viewer-a@example.com');
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1]!, 'base64url').toString()) as Record<string, unknown>;
    expect(payload).toMatchObject({ tenantId: 'tenant-a', role: 'viewer', sub: expect.any(String), sid: expect.any(String) });
    expect((payload.exp as number) - (payload.iat as number)).toBe(15 * 60);
  });

  it('answers an unknown email and a wrong password with exactly the same response', async () => {
    const wrongPassword = await loginAttempt('viewer-a@example.com', 'contraseña equivocada');
    const unknownEmail = await loginAttempt('ghost@example.com', PASSWORD);
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body.error).toEqual({ code: 'INVALID_CREDENTIALS', message: 'Correo o contraseña incorrectos' });
    expect(comparable(unknownEmail)).toEqual(comparable(wrongPassword));
  });

  it('does not let a deactivated or invited account in, with the same response', async () => {
    await insertUser('deactivated@example.com', 'deactivated');
    await insertUser('invited@example.com', 'invited');
    const reference = await loginAttempt('ghost@example.com', PASSWORD);
    expect(comparable(await loginAttempt('deactivated@example.com', PASSWORD))).toEqual(comparable(reference));
    expect(comparable(await loginAttempt('invited@example.com', PASSWORD))).toEqual(comparable(reference));
  });

  it('locks the account for 5 minutes on the sixth consecutive failure, even with the right password', async () => {
    await seedUser('locked@example.com', 'user', 'tenant-a');
    for (let i = 0; i < 5; i++) expect((await loginAttempt('locked@example.com', 'contraseña equivocada')).status).toBe(401);

    const sixth = await loginAttempt('locked@example.com', 'contraseña equivocada');
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe('TOO_MANY_ATTEMPTS');
    expect((await loginAttempt('locked@example.com', PASSWORD)).status).toBe(429);

    const user = await getDatabase().collection(USERS_COLLECTION).findOne({ email: 'locked@example.com' });
    const lockMs = (user!.lockedUntil as Date).getTime() - Date.now();
    expect(lockMs).toBeGreaterThan(4 * 60_000);
    expect(lockMs).toBeLessThanOrEqual(5 * 60_000);

    // Pasado el bloqueo, la contraseña correcta vuelve a entrar.
    await getDatabase().collection(USERS_COLLECTION).updateOne({ email: 'locked@example.com' }, { $set: { lockedUntil: new Date(Date.now() - 1000) } });
    await login('locked@example.com');
  });

  it('resets the failure counter after a successful login', async () => {
    await seedUser('counter@example.com', 'user', 'tenant-a');
    for (let i = 0; i < 4; i++) expect((await loginAttempt('counter@example.com', 'contraseña equivocada')).status).toBe(401);
    await login('counter@example.com');
    for (let i = 0; i < 4; i++) expect((await loginAttempt('counter@example.com', 'contraseña equivocada')).status).toBe(401);
    await login('counter@example.com');
  });

  it('rate-limits repeated attempts from the same IP', async () => {
    const attempt = () => loginAttempt('ghost@example.com', 'contraseña equivocada');
    for (let i = 0; i < 10; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('rejects an invalid body with VALIDATION_ERROR in the uniform format', async () => {
    const response = await request(app).post('/auth/login').send({ email: 'not-an-email' });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        details: expect.arrayContaining([
          { field: 'email', message: expect.any(String), code: expect.any(String) },
          { field: 'password', message: expect.any(String), code: expect.any(String) },
        ]),
      },
      timestamp: expect.any(String),
      path: '/auth/login',
    });
  });
});

describe('sesión por cookie httpOnly (web)', () => {
  const cookieMode = { 'X-Session-Transport': 'cookie' };
  const cookieLogin = () => request(app).post('/auth/login').set(cookieMode).send({ email: 'admin-a@example.com', password: PASSWORD });
  const refreshCookie = (response: request.Response) =>
    (response.headers['set-cookie'] as unknown as string[]).find((cookie) => cookie.startsWith('tssera_rt='))!;

  it('login entrega el refresh token solo en una cookie httpOnly limitada a /auth', async () => {
    const response = await cookieLogin();
    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toContain('refreshToken');
    const cookie = refreshCookie(response);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/auth/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('refresh lee la cookie, la rota y no devuelve el token en el cuerpo', async () => {
    const first = refreshCookie(await cookieLogin()).split(';')[0]!;
    const rotated = await request(app).post('/auth/refresh').set(cookieMode).set('Cookie', first).send({});
    expect(rotated.status).toBe(200);
    expect(JSON.stringify(rotated.body)).not.toContain('refreshToken');
    expect(refreshCookie(rotated).split(';')[0]).not.toBe(first);
    expect((await request(app).get('/me').set(bearer(rotated.body.data.accessToken))).status).toBe(200);
  });

  it('sin cookie o con una inválida responde 401 y la borra; la cookie sola, sin la cabecera, no sirve', async () => {
    const missing = await request(app).post('/auth/refresh').set(cookieMode).send({});
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe('INVALID_REFRESH_TOKEN');

    const invalid = await request(app).post('/auth/refresh').set(cookieMode).set('Cookie', 'tssera_rt=no-existe').send({});
    expect(invalid.status).toBe(401);
    expect(refreshCookie(invalid)).toMatch(/tssera_rt=;/);

    const cookie = refreshCookie(await cookieLogin()).split(';')[0]!;
    expect((await request(app).post('/auth/refresh').set('Cookie', cookie).send({})).status).toBe(400);
  });

  it('logout revoca la sesión y borra la cookie', async () => {
    const session = await cookieLogin();
    const cookie = refreshCookie(session).split(';')[0]!;
    const logout = await request(app).post('/auth/logout').set(cookieMode).set(bearer(session.body.data.accessToken));
    expect(logout.status).toBe(204);
    expect(refreshCookie(logout)).toMatch(/tssera_rt=;/);
    expect((await request(app).post('/auth/refresh').set(cookieMode).set('Cookie', cookie).send({})).status).toBe(401);
  });

  it('CORS permite credenciales al origen que hace la petición', async () => {
    const response = await request(app).options('/auth/refresh').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'POST');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});

describe('sessions', () => {
  it('refresh rotates the token and the previous one no longer works', async () => {
    const first = await login('admin-a@example.com');
    const rotated = await request(app).post('/auth/refresh').send({ refreshToken: first.refreshToken });
    expect(rotated.status).toBe(200);
    expect(rotated.body.data.refreshToken).not.toBe(first.refreshToken);
    expect(rotated.body.data.accessToken).toEqual(expect.any(String));

    const reuse = await request(app).post('/auth/refresh').send({ refreshToken: first.refreshToken });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('REFRESH_TOKEN_REUSED');
    // Reutilizar un token rotado se trata como robo: también se revoca la sesión nueva.
    expect((await request(app).post('/auth/refresh').send({ refreshToken: rotated.body.data.refreshToken })).status).toBe(401);
  });

  it('stores only the SHA-256 of the refresh token', async () => {
    const { refreshToken } = await login('admin-a@example.com');
    const sessions = getDatabase().collection(SESSIONS_COLLECTION);
    expect(await sessions.findOne({ refreshTokenHash: refreshToken })).toBeNull();
    const stored = await sessions.findOne({ refreshTokenHash: hashToken(refreshToken) });
    expect(stored).toMatchObject({ tenantId: 'tenant-a', revokedAt: null, custom: {} });
    const days = ((stored!.expiresAt as Date).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
  });

  it('logout revokes the current session only', async () => {
    const current = await login('viewer-a@example.com');
    const other = await login('viewer-a@example.com');
    expect((await request(app).post('/auth/logout').set(bearer(current.accessToken))).status).toBe(204);
    expect((await request(app).post('/auth/refresh').send({ refreshToken: current.refreshToken })).status).toBe(401);
    expect((await request(app).post('/auth/refresh').send({ refreshToken: other.refreshToken })).status).toBe(200);
  });

  it('an access token stops working as soon as its session is closed or rotated', async () => {
    const closed = await login('viewer-a@example.com');
    expect((await request(app).get('/me').set(bearer(closed.accessToken))).status).toBe(200);
    await request(app).post('/auth/logout').set(bearer(closed.accessToken));
    const afterLogout = await request(app).get('/me').set(bearer(closed.accessToken));
    expect(afterLogout.status).toBe(401);
    expect(afterLogout.body.error.code).toBe('INVALID_TOKEN');

    const rotated = await login('viewer-a@example.com');
    const next = await request(app).post('/auth/refresh').send({ refreshToken: rotated.refreshToken });
    expect((await request(app).get('/me').set(bearer(rotated.accessToken))).status).toBe(401);
    expect((await request(app).get('/me').set(bearer(next.body.data.accessToken))).status).toBe(200);
  });

  it('takes the role from the database, not from the access token', async () => {
    const user = await insertUser('promoted@example.com', 'active');
    const { accessToken } = await login('promoted@example.com');
    expect((await request(app).get('/users').set(bearer(accessToken))).status).toBe(403);
    await getDatabase().collection(USERS_COLLECTION).updateOne({ _id: user._id as never }, { $set: { role: 'admin' } });
    expect((await request(app).get('/users').set(bearer(accessToken))).status).toBe(200);
  });

  it('a logged-out refresh token is just invalid, not treated as theft', async () => {
    const current = await login('viewer-a@example.com');
    await request(app).post('/auth/logout').set(bearer(current.accessToken));
    const response = await request(app).post('/auth/refresh').send({ refreshToken: current.refreshToken });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('logout requires authentication', async () => {
    expect((await request(app).post('/auth/logout')).status).toBe(401);
  });

  it('does not accept an access token as a refresh token', async () => {
    const { accessToken } = await login('viewer-a@example.com');
    expect((await request(app).post('/auth/refresh').send({ refreshToken: accessToken })).status).toBe(401);
  });
});

describe('password recovery', () => {
  it('forgot answers the same for known and unknown emails and only emails the known one', async () => {
    await seedUser('recover@example.com', 'user', 'tenant-a');
    sent.length = 0;

    const known = await request(app).post('/auth/password/forgot').send({ email: 'recover@example.com' });
    expect(sent).toHaveLength(1);
    const unknown = await request(app).post('/auth/password/forgot').send({ email: 'nobody@example.com' });
    expect(sent).toHaveLength(1);

    expect(known.status).toBe(202);
    expect(known.body.data).toEqual({ message: FORGOT_PASSWORD_MESSAGE });
    expect(comparable(unknown)).toEqual(comparable(known));

    const [email] = sent;
    expect(email).toMatchObject({ to: 'recover@example.com', subject: 'Restablece tu contraseña' });
    expect(email!.html).toContain('Restablecer contraseña');
    expect(email!.html).toContain('Si no lo pediste, ignora este correo.');
    expect(email!.html).toContain(`${config.appWebUrl}/restablecer?token=`);
  });

  it('does not email deactivated accounts', async () => {
    await insertUser('gone@example.com', 'deactivated');
    expect((await request(app).post('/auth/password/forgot').send({ email: 'gone@example.com' })).status).toBe(202);
    expect(sent).toHaveLength(0);
  });

  it('reset works once, revokes existing sessions, is audited and does not log in', async () => {
    const user = await seedUser('reset@example.com', 'user', 'tenant-a');
    const { refreshToken } = await login('reset@example.com');
    sent.length = 0;
    await request(app).post('/auth/password/forgot').send({ email: 'reset@example.com' });
    const token = tokenFromEmail(sent[0]!);

    const reset = await request(app).post('/auth/password/reset').send({ token, password: NEW_PASSWORD });
    expect(reset.status).toBe(204);
    expect(reset.body).toEqual({});

    expect((await loginAttempt('reset@example.com', PASSWORD)).status).toBe(401);
    await login('reset@example.com', NEW_PASSWORD);
    expect((await request(app).post('/auth/refresh').send({ refreshToken })).status).toBe(401);

    const again = await request(app).post('/auth/password/reset').send({ token, password: 'otra frase distinta y larga' });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_TOKEN');

    const audit = await getDatabase().collection(AUDIT_LOGS_COLLECTION).findOne({ entityId: user.id, action: 'password_reset' });
    expect(audit).toMatchObject({ tenantId: 'tenant-a', actorId: user.id, entity: 'user' });
    expect(JSON.stringify(audit)).not.toMatch(/scrypt/);
  });

  it('reset rejects an expired token', async () => {
    const user = await seedUser('expired@example.com', 'user', 'tenant-a');
    const token = await insertAuthToken(user.id, 'password_reset', new Date(Date.now() - 1000));
    const response = await request(app).post('/auth/password/reset').send({ token, password: NEW_PASSWORD });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_TOKEN');
    await login('expired@example.com');
  });

  it('reset rejects an invented token, an invitation token and a short password', async () => {
    const user = await seedUser('wrong-type@example.com', 'user', 'tenant-a');
    const invitation = await insertAuthToken(user.id, 'invitation');
    expect((await request(app).post('/auth/password/reset').send({ token: 'invented', password: NEW_PASSWORD })).body.error.code).toBe('INVALID_TOKEN');
    expect((await request(app).post('/auth/password/reset').send({ token: invitation, password: NEW_PASSWORD })).body.error.code).toBe('INVALID_TOKEN');
    const short = await request(app).post('/auth/password/reset').send({ token: 'invented', password: 'catorce chars!' });
    expect(short.status).toBe(400);
    expect(short.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('a new request invalidates the previous link', async () => {
    await seedUser('twice@example.com', 'user', 'tenant-a');
    await request(app).post('/auth/password/forgot').send({ email: 'twice@example.com' });
    const first = tokenFromEmail(sent.at(-1)!);
    await request(app).post('/auth/password/forgot').send({ email: 'twice@example.com' });
    expect((await request(app).post('/auth/password/reset').send({ token: first, password: NEW_PASSWORD })).status).toBe(400);
    expect((await request(app).post('/auth/password/reset').send({ token: tokenFromEmail(sent.at(-1)!), password: NEW_PASSWORD })).status).toBe(204);
  });

  it('stores only the hash of the token', async () => {
    await seedUser('hash-only@example.com', 'user', 'tenant-a');
    await request(app).post('/auth/password/forgot').send({ email: 'hash-only@example.com' });
    const token = tokenFromEmail(sent.at(-1)!);
    const tokens = getDatabase().collection(AUTH_TOKENS_COLLECTION);
    expect(await tokens.findOne({ tokenHash: token })).toBeNull();
    const stored = await tokens.findOne({ tokenHash: hashToken(token) });
    expect(stored).toMatchObject({ type: 'password_reset', usedAt: null, tenantId: 'tenant-a' });
    const minutes = ((stored!.expiresAt as Date).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(59);
    expect(minutes).toBeLessThanOrEqual(60);
  });
});

describe('POST /auth/invitations/accept', () => {
  it('activates the invited account with the new password', async () => {
    const user = await insertUser('guest@example.com', 'invited');
    const token = await insertAuthToken(user._id, 'invitation');

    expect((await request(app).post('/auth/invitations/accept').send({ token, password: NEW_PASSWORD })).status).toBe(204);
    const { accessToken } = await login('guest@example.com', NEW_PASSWORD);
    const me = await request(app).get('/me').set(bearer(accessToken));
    expect(me.body.data.user.status).toBe('active');

    const again = await request(app).post('/auth/invitations/accept').send({ token, password: NEW_PASSWORD });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_TOKEN');
    expect(await getDatabase().collection(AUDIT_LOGS_COLLECTION).findOne({ entityId: user._id, action: 'invitation_accepted' })).not.toBeNull();
  });

  it('rejects expired invitations and password-reset tokens', async () => {
    const user = await insertUser('late@example.com', 'invited');
    const expired = await insertAuthToken(user._id, 'invitation', new Date(Date.now() - 1000));
    expect((await request(app).post('/auth/invitations/accept').send({ token: expired, password: NEW_PASSWORD })).status).toBe(400);
    const reset = await insertAuthToken(user._id, 'password_reset');
    expect((await request(app).post('/auth/invitations/accept').send({ token: reset, password: NEW_PASSWORD })).status).toBe(400);
    expect((await loginAttempt('late@example.com', NEW_PASSWORD)).status).toBe(401);
  });
});

describe('GET /me', () => {
  it('requires a valid token', async () => {
    expect((await request(app).get('/me')).status).toBe(401);
    const invalid = await request(app).get('/me').set(bearer('not-a-jwt'));
    expect(invalid.status).toBe(401);
    expect(invalid.body.error.code).toBe('INVALID_TOKEN');
  });

  it.each<[string, Role]>([['admin-a@example.com', 'admin'], ['viewer-a@example.com', 'viewer']])(
    'returns the user, company, role and the permissions of the role (%s)',
    async (email, role) => {
      const { accessToken } = await login(email);
      const response = await request(app).get('/me').set(bearer(accessToken));
      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({
        user: expect.objectContaining({ email, role, tenantId: 'tenant-a' }),
        company: { id: 'tenant-a', name: 'Constructora A' },
        role,
        permissions: permissionsForRole(role),
      });
    },
  );

  it('gives a viewer only read permissions and no admin modules', async () => {
    const { accessToken } = await login('viewer-a@example.com');
    const { permissions } = (await request(app).get('/me').set(bearer(accessToken))).body.data as { permissions: string[] };
    expect(permissions).toContain('catalogs.product.read');
    expect(permissions).not.toContain('catalogs.product.create');
    expect(permissions).toContain('construction.projects:read');
    expect(permissions).not.toContain('construction.budget:read_amounts');
    expect(permissions).not.toContain('users.read');
  });

  it('falls back to the tenant id when the company has no record', async () => {
    const { accessToken } = await login('admin-b@example.com');
    const response = await request(app).get('/me').set(bearer(accessToken));
    expect(response.body.data.company).toEqual({ id: 'tenant-b', name: 'tenant-b' });
  });
});

describe('users and tenant isolation', () => {
  it('only lists users of the token tenant and ignores an X-Tenant-Id header', async () => {
    const { accessToken } = await login('admin-b@example.com');
    const response = await request(app).get('/users').set(bearer(accessToken)).set('X-Tenant-Id', 'tenant-a');
    expect(response.status).toBe(200);
    expect(response.body.data.items.map((user: { email: string }) => user.email)).toEqual(['admin-b@example.com']);
  });

  it('no longer creates accounts with a password over the API: users join by invitation', async () => {
    const { accessToken } = await login('admin-a@example.com');
    const response = await request(app).post('/users').set(bearer(accessToken))
      .send({ email: 'new-a@example.com', name: 'Nuevo', password: NEW_PASSWORD });
    expect(response.status).toBe(404);
    expect(await getDatabase().collection(USERS_COLLECTION).findOne({ email: 'new-a@example.com' })).toBeNull();
  });

  it('the seed service rejects duplicated emails across tenants', async () => {
    await expect(seedUser('admin-b@example.com', 'user', 'tenant-a')).rejects.toMatchObject({ statusCode: 409, code: 'EMAIL_TAKEN' });
  });

  it('sends a welcome email when a user is created, without the password', async () => {
    await seedUser('welcome@example.com', 'user', 'tenant-a');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'welcome@example.com', subject: 'Tu cuenta fue creada' });
    expect(sent[0]!.text + sent[0]!.html).not.toContain(PASSWORD);
  });
});

describe('legacy users', () => {
  it('migrates users without status so they keep logging in', async () => {
    const db = getDatabase();
    await db.collection(USERS_COLLECTION).insertOne({
      _id: 'legacy-user' as never, tenantId: 'tenant-a', email: 'legacy@example.com', name: 'Legacy', role: 'user',
      passwordHash: await hashPassword(PASSWORD), createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    });
    await migrateIdentityDocuments(db);
    expect(await db.collection(USERS_COLLECTION).findOne({ email: 'legacy@example.com' }))
      .toMatchObject({ status: 'active', failedLoginCount: 0, lockedUntil: null, custom: {} });
    await login('legacy@example.com');
  });
});

describe('unknown routes', () => {
  it('returns a JSON 404', async () => {
    const response = await request(app).get('/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
