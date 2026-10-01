import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { ServerConfig } from '@erp/config';
import { createApp } from '../../app';
import { closeDB, connectDB, getDatabase } from '../../config/database';
import { ensureIdentityIndexes, identityRepositories } from './identity.repository';
import { IdentityService } from './identity.service';
import type { EmailMessage, Mailer } from '../../platform/integrations/email';

const config = {
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

const PASSWORD = 'correct-horse-battery';
let mongo: MongoMemoryServer;
let app: ReturnType<typeof createApp>;
const sent: EmailMessage[] = [];
const mailer: Mailer = { send: async (message) => { sent.push(message); } };

async function seedUser(email: string, role: 'admin' | 'viewer' | 'user', tenantId: string) {
  const { users, refreshTokens, passwordResets } = identityRepositories(getDatabase());
  return new IdentityService(users, refreshTokens, config, passwordResets, mailer).createUser({ email, name: email, role, password: PASSWORD }, tenantId);
}

async function login(email: string) {
  const response = await request(app).post('/auth/login').send({ email, password: PASSWORD });
  expect(response.status).toBe(200);
  return response.body.data as { accessToken: string; refreshToken: string };
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDB(mongo.getUri(), 'erp-test');
  await ensureIdentityIndexes(getDatabase());
  await seedUser('admin-a@example.com', 'admin', 'tenant-a');
  await seedUser('viewer-a@example.com', 'viewer', 'tenant-a');
  await seedUser('admin-b@example.com', 'admin', 'tenant-b');
}, 120_000);

// App nueva por test: el rate limit de login cuenta por instancia y aquí se hacen muchos logins.
beforeEach(() => {
  sent.length = 0;
  app = createApp(config, undefined, mailer);
});

afterAll(async () => {
  await closeDB();
  await mongo?.stop();
});

describe('POST /auth/login', () => {
  it('returns tokens and the public user, never the password hash', async () => {
    const response = await request(app).post('/auth/login').send({ email: 'ADMIN-A@example.com ', password: PASSWORD });
    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.user).toMatchObject({ email: 'admin-a@example.com', role: 'admin', tenantId: 'tenant-a' });
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(response.body.data.user._id).toBeUndefined();
  });

  it('rejects a wrong password and an unknown email with the same error', async () => {
    const wrongPassword = await request(app).post('/auth/login').send({ email: 'admin-a@example.com', password: 'nope-nope' });
    const unknownEmail = await request(app).post('/auth/login').send({ email: 'ghost@example.com', password: PASSWORD });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknownEmail.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rate-limits repeated attempts from the same IP', async () => {
    const attempt = () => request(app).post('/auth/login').send({ email: 'admin-a@example.com', password: 'wrong-pass' });
    for (let i = 0; i < 10; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('validates the body', async () => {
    const response = await request(app).post('/auth/login').send({ email: 'not-an-email' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('authentication and tenant isolation', () => {
  it('requires a token for protected routes', async () => {
    expect((await request(app).get('/auth/me')).status).toBe(401);
    expect((await request(app).get('/users')).status).toBe(401);
  });

  it('rejects an invalid token', async () => {
    const response = await request(app).get('/auth/me').set('Authorization', 'Bearer not-a-jwt');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_TOKEN');
  });

  it('returns the current user', async () => {
    const { accessToken } = await login('admin-a@example.com');
    const response = await request(app).get('/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data.email).toBe('admin-a@example.com');
  });

  it('only lists users of the token tenant and ignores an X-Tenant-Id header', async () => {
    const { accessToken } = await login('admin-a@example.com');
    const response = await request(app)
      .get('/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Tenant-Id', 'tenant-b');
    expect(response.status).toBe(200);
    const emails = response.body.data.map((user: { email: string }) => user.email).sort();
    expect(emails).toEqual(['admin-a@example.com', 'viewer-a@example.com']);
  });
});

describe('POST /users', () => {
  it('lets an admin create a user in their own tenant', async () => {
    const { accessToken } = await login('admin-a@example.com');
    const response = await request(app).post('/users').set('Authorization', `Bearer ${accessToken}`)
      .send({ email: 'new-a@example.com', name: 'Nuevo', password: 'another-password', tenantId: 'tenant-b' });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ email: 'new-a@example.com', role: 'user', tenantId: 'tenant-a' });
  });

  it('forbids a viewer', async () => {
    const { accessToken } = await login('viewer-a@example.com');
    const response = await request(app).post('/users').set('Authorization', `Bearer ${accessToken}`)
      .send({ email: 'x@example.com', name: 'X', password: 'another-password' });
    expect(response.status).toBe(403);
  });

  it('forbids an admin from creating a superadmin', async () => {
    const { accessToken } = await login('admin-a@example.com');
    const response = await request(app).post('/users').set('Authorization', `Bearer ${accessToken}`)
      .send({ email: 'root@example.com', name: 'Root', role: 'superadmin', password: 'another-password' });
    expect(response.status).toBe(403);
  });

  it('rejects a duplicated email', async () => {
    const { accessToken } = await login('admin-a@example.com');
    const response = await request(app).post('/users').set('Authorization', `Bearer ${accessToken}`)
      .send({ email: 'admin-b@example.com', name: 'Dup', password: 'another-password' });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_TAKEN');
  });
});

describe('refresh tokens', () => {
  it('rotates the refresh token', async () => {
    const first = await login('admin-a@example.com');
    const response = await request(app).post('/auth/refresh').send({ refreshToken: first.refreshToken });
    expect(response.status).toBe(200);
    expect(response.body.data.refreshToken).not.toBe(first.refreshToken);
  });

  it('detects reuse of a rotated token and revokes every session', async () => {
    const first = await login('admin-a@example.com');
    const rotated = await request(app).post('/auth/refresh').send({ refreshToken: first.refreshToken });
    const reuse = await request(app).post('/auth/refresh').send({ refreshToken: first.refreshToken });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('REFRESH_TOKEN_REUSED');
    const afterRevoke = await request(app).post('/auth/refresh').send({ refreshToken: rotated.body.data.refreshToken });
    expect(afterRevoke.status).toBe(401);
  });

  it('logout revokes the refresh token', async () => {
    const { refreshToken } = await login('viewer-a@example.com');
    expect((await request(app).post('/auth/logout').send({ refreshToken })).status).toBe(204);
    expect((await request(app).post('/auth/refresh').send({ refreshToken })).status).toBe(401);
  });

  it('does not accept an access token as a refresh token', async () => {
    const { accessToken } = await login('viewer-a@example.com');
    expect((await request(app).post('/auth/refresh').send({ refreshToken: accessToken })).status).toBe(401);
  });
});

describe('unknown routes', () => {
  it('returns a JSON 404', async () => {
    const response = await request(app).get('/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});

describe('emails', () => {
  it('sends a welcome email when a user is created, without the password', async () => {
    await seedUser('welcome@example.com', 'user', 'tenant-a');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'welcome@example.com', subject: 'Tu cuenta fue creada' });
    expect(sent[0]!.text + sent[0]!.html).not.toContain(PASSWORD);
  });

  describe('password reset', () => {
    const NEW_PASSWORD = 'a-brand-new-password';
    const tokenFromEmail = () => /código de restablecimiento es: (\S+)/.exec(sent[0]!.text)![1]!;

    it('answers the same for unknown emails and sends nothing', async () => {
      const response = await request(app).post('/auth/forgot-password').send({ email: 'nobody@example.com' });
      expect(response.status).toBe(202);
      expect(sent).toHaveLength(0);
    });

    it('resets the password once, revokes sessions and rejects a reused token', async () => {
      await seedUser('reset@example.com', 'user', 'tenant-a');
      const { refreshToken } = await login('reset@example.com');
      sent.length = 0;

      expect((await request(app).post('/auth/forgot-password').send({ email: 'reset@example.com' })).status).toBe(202);
      expect(sent).toHaveLength(1);
      expect(sent[0]!.to).toBe('reset@example.com');
      const token = tokenFromEmail();

      expect((await request(app).post('/auth/reset-password').send({ token, password: NEW_PASSWORD })).status).toBe(204);
      expect((await request(app).post('/auth/login').send({ email: 'reset@example.com', password: PASSWORD })).status).toBe(401);
      expect((await request(app).post('/auth/login').send({ email: 'reset@example.com', password: NEW_PASSWORD })).status).toBe(200);
      expect((await request(app).post('/auth/refresh').send({ refreshToken })).status).toBe(401);

      const reuse = await request(app).post('/auth/reset-password').send({ token, password: 'another-password-1' });
      expect(reuse.status).toBe(400);
      expect(reuse.body.error.code).toBe('INVALID_RESET_TOKEN');
    });

    it('rejects an invented token and a weak password', async () => {
      expect((await request(app).post('/auth/reset-password').send({ token: 'invented', password: NEW_PASSWORD })).status).toBe(400);
      expect((await request(app).post('/auth/reset-password').send({ token: 'invented', password: 'short' })).status).toBe(400);
    });

    it('invalidates the previous token when a new one is requested', async () => {
      await seedUser('twice@example.com', 'user', 'tenant-a');
      await request(app).post('/auth/forgot-password').send({ email: 'twice@example.com' });
      const first = /código de restablecimiento es: (\S+)/.exec(sent.at(-1)!.text)![1]!;
      await request(app).post('/auth/forgot-password').send({ email: 'twice@example.com' });
      expect((await request(app).post('/auth/reset-password').send({ token: first, password: NEW_PASSWORD })).status).toBe(400);
    });
  });
});
