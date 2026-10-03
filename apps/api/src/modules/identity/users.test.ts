import request from 'supertest';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { PublicUser, Role } from '@erp/domain';
import { createApp } from '../../app';
import { getDatabase } from '../../config/database';
import { AUDIT_TRAIL_COLLECTION } from '../../core/audit';
import type { RequestUser } from '../../core/middlewares/auth';
import { startDatabase, stopDatabase, testConfig as config } from '../../test/helpers';
import type { EmailMessage, EmailSender } from '../../platform/integrations/email';
import { AUTH_TOKENS_COLLECTION, identityRepositories, USERS_COLLECTION } from './identity.repository';
import { createIdentityService, createUsersService } from './identity.routes';
import { hashToken } from './tokens';

const PASSWORD = 'correct-horse-battery';
const NEW_PASSWORD = 'una frase nueva y bastante larga';
let replSet: MongoMemoryReplSet;
let app: ReturnType<typeof createApp>;
const sent: EmailMessage[] = [];
let failEmails = false;
const emailSender: EmailSender = {
  send: async (message) => {
    if (failEmails) throw new Error('Resend responded 403');
    sent.push(message);
  },
};

interface Tokens { accessToken: string; refreshToken: string }

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const tokenFromEmail = (message: EmailMessage) => /\/activar\?token=([A-Za-z0-9_-]+)/.exec(message.text)![1]!;
const loginAttempt = (email: string, password = PASSWORD) => request(app).post('/auth/login').send({ email, password });
const refresh = (refreshToken: string) => request(app).post('/auth/refresh').send({ refreshToken });
const accept = (token: string, password = NEW_PASSWORD) => request(app).post('/auth/invitations/accept').send({ token, password });

async function seedUser(email: string, role: Role, tenantId = 'tenant-a'): Promise<PublicUser> {
  return createIdentityService(getDatabase(), config, emailSender).createUser({ email, name: email, role, password: PASSWORD }, tenantId);
}

async function login(email: string, password = PASSWORD): Promise<Tokens> {
  const response = await loginAttempt(email, password);
  expect(response.status).toBe(200);
  return response.body.data as Tokens;
}

/** Peticiones autenticadas de un usuario, con una sesión nueva. */
async function as(email: string) {
  const { accessToken } = await login(email);
  return {
    get: (path: string) => request(app).get(path).set(bearer(accessToken)),
    post: (path: string, body: object = {}) => request(app).post(path).set(bearer(accessToken)).send(body),
    patch: (path: string, body: object = {}) => request(app).patch(path).set(bearer(accessToken)).send(body),
  };
}

async function invite(email: string, role: 'admin' | 'user' = 'user') {
  const response = await (await as('admin-a@example.com')).post('/users/invitations', { email, name: `Invitado ${email}`, role });
  expect(response.status).toBe(201);
  return response.body.data.user as PublicUser;
}

const storedUser = (id: string) => getDatabase().collection(USERS_COLLECTION).findOne({ _id: id as never });
const auditActions = async (entityId: string) =>
  (await getDatabase().collection(AUDIT_TRAIL_COLLECTION).find({ entityType: 'user', entityId }).sort({ at: 1, _id: 1 }).toArray())
    .map((entry) => entry.action);

beforeAll(async () => {
  replSet = await startDatabase();
  await identityRepositories(getDatabase()).tenants.ensure('tenant-a', 'Constructora A');
  await seedUser('admin-a@example.com', 'admin');
  await seedUser('user-a@example.com', 'user');
  await seedUser('admin-b@example.com', 'admin', 'tenant-b');
}, 120_000);

// App nueva por test: el rate limit por IP cuenta por instancia y aquí se hacen muchos logins.
beforeEach(() => {
  sent.length = 0;
  failEmails = false;
  app = createApp(config, undefined, emailSender);
});

afterAll(async () => {
  await stopDatabase(replSet);
});

describe('GET /users', () => {
  it('lista paginada del propio tenant, sin datos de la contraseña', async () => {
    const response = await (await as('admin-a@example.com')).get('/users?pageSize=100');
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ page: 1, pageSize: 100 });
    const emails = response.body.data.items.map((user: PublicUser) => user.email);
    expect(emails).toEqual(expect.arrayContaining(['admin-a@example.com', 'user-a@example.com']));
    expect(emails).not.toContain('admin-b@example.com');
    expect(response.body.data.total).toBe(emails.length);
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|scrypt/);
  });

  it('busca por nombre o correo y filtra por estado', async () => {
    await invite('pendiente.lista@example.com');
    const admin = await as('admin-a@example.com');
    const emailsOf = async (query: string) =>
      ((await admin.get(`/users?${query}`)).body.data.items as PublicUser[]).map((user) => user.email);

    expect(await emailsOf('q=USER-A')).toEqual(['user-a@example.com']);
    expect(await emailsOf(`q=${encodeURIComponent('Invitado pendiente.lista')}`)).toEqual(['pendiente.lista@example.com']);
    // La búsqueda es literal: un punto no es un comodín.
    expect(await emailsOf('q=user.a')).toEqual([]);
    expect(await emailsOf('status=invited')).toEqual(['pendiente.lista@example.com']);
    expect(await emailsOf('status=active&q=pendiente')).toEqual([]);
    expect((await admin.get('/users?status=nope')).body.error.code).toBe('VALIDATION_ERROR');

    const page = (await admin.get('/users?pageSize=1&page=2')).body.data;
    expect(page.items).toHaveLength(1);
    expect(page.total).toBeGreaterThan(2);
  });

  it('un user recibe 403 en todas las rutas de /users y sin sesión, 401', async () => {
    const target = await invite('objetivo.403@example.com');
    const user = await as('user-a@example.com');
    const responses = await Promise.all([
      user.get('/users'), user.post('/users/invitations', { email: 'x@example.com', name: 'X', role: 'user' }),
      user.post(`/users/${target.id}/invitations/resend`), user.patch(`/users/${target.id}/role`, { role: 'admin' }),
      user.post(`/users/${target.id}/deactivate`), user.post(`/users/${target.id}/reactivate`),
    ]);
    expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403, 403, 403]);
    expect(responses[0].body.error.code).toBe('FORBIDDEN');
    expect((await request(app).get('/users')).status).toBe(401);
    expect((await storedUser(target.id))).toMatchObject({ role: 'user', status: 'invited' });
  });
});

describe('invitaciones', () => {
  it('invitar crea el usuario en invited, envía el enlace de activación y lo registra en la bitácora', async () => {
    const response = await (await as('admin-a@example.com'))
      .post('/users/invitations', { email: ' Nueva@Example.com ', name: ' Nueva Persona ', role: 'admin', tenantId: 'tenant-b' });

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual({
      emailSent: true,
      user: expect.objectContaining({ email: 'nueva@example.com', name: 'Nueva Persona', role: 'admin', status: 'invited', tenantId: 'tenant-a' }),
    });
    const { id } = response.body.data.user as PublicUser;
    expect(await storedUser(id)).toMatchObject({ passwordHash: null, status: 'invited' });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'nueva@example.com', subject: 'Te invitaron a Constructora A' });
    const token = tokenFromEmail(sent[0]!);
    expect(sent[0]!.text).toContain(`http://web.test/activar?token=${token}`);
    expect(sent[0]!.html).toContain(`http://web.test/activar?token=${token}`);
    // En la base solo queda el hash del token, con una vigencia de 7 días.
    const stored = await getDatabase().collection(AUTH_TOKENS_COLLECTION).findOne({ userId: id });
    expect(stored).toMatchObject({ type: 'invitation', tokenHash: hashToken(token), usedAt: null, tenantId: 'tenant-a' });
    const days = ((stored!.expiresAt as Date).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);

    const [entry] = await getDatabase().collection(AUDIT_TRAIL_COLLECTION).find({ entityId: id }).toArray();
    expect(entry).toMatchObject({ action: 'user.invited', entityType: 'user', tenantId: 'tenant-a' });
    expect(entry.summary).toContain('nueva@example.com');
    expect(JSON.stringify(entry)).not.toContain(token);
    // Sin aceptar la invitación no hay forma de entrar.
    expect((await loginAttempt('nueva@example.com', NEW_PASSWORD)).status).toBe(401);
  });

  it('aceptar la invitación permite iniciar sesión', async () => {
    const user = await invite('acepta@example.com');
    expect((await accept(tokenFromEmail(sent[0]!))).status).toBe(204);

    const session = await login('acepta@example.com', NEW_PASSWORD);
    const me = await request(app).get('/me').set(bearer(session.accessToken));
    expect(me.body.data).toMatchObject({ user: { id: user.id, status: 'active' }, role: 'user', company: { name: 'Constructora A' } });
    // El enlace es de un solo uso.
    expect((await accept(tokenFromEmail(sent[0]!))).status).toBe(400);
  });

  it('reenviar genera un token nuevo e invalida el anterior', async () => {
    const user = await invite('reenvio@example.com');
    const first = tokenFromEmail(sent[0]!);

    const resent = await (await as('admin-a@example.com')).post(`/users/${user.id}/invitations/resend`);
    expect(resent.status).toBe(200);
    expect(resent.body.data).toMatchObject({ emailSent: true, user: { id: user.id, status: 'invited' } });
    expect(sent).toHaveLength(2);
    const second = tokenFromEmail(sent[1]!);
    expect(second).not.toBe(first);

    const old = await accept(first);
    expect(old.status).toBe(400);
    expect(old.body.error.code).toBe('INVALID_TOKEN');
    expect((await accept(second)).status).toBe(204);
    await login('reenvio@example.com', NEW_PASSWORD);
    expect(await auditActions(user.id)).toEqual(['user.invited', 'user.invitation_resent']);

    // Una cuenta ya activa no tiene invitación que reenviar.
    const again = await (await as('admin-a@example.com')).post(`/users/${user.id}/invitations/resend`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('invitar un correo que ya existe, en este u otro tenant, devuelve 409 EMAIL_IN_USE', async () => {
    const admin = await as('admin-a@example.com');
    for (const email of ['user-a@example.com', 'ADMIN-B@example.com']) {
      const response = await admin.post('/users/invitations', { email, name: 'Duplicado', role: 'user' });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('EMAIL_IN_USE');
    }
    expect(sent).toHaveLength(0);
    expect(await getDatabase().collection(USERS_COLLECTION).countDocuments({ name: 'Duplicado' })).toBe(0);
  });

  it('valida la entrada: correo, nombre y solo los roles asignables', async () => {
    const admin = await as('admin-a@example.com');
    for (const [body, field] of [
      [{ email: 'no-es-correo', name: 'X', role: 'user' }, 'email'], [{ email: 'v@example.com', name: '  ', role: 'user' }, 'name'],
      [{ email: 'v@example.com', name: 'X', role: 'superadmin' }, 'role'], [{ email: 'v@example.com', name: 'X' }, 'role'],
    ] as const) {
      const response = await admin.post('/users/invitations', body);
      expect(response.status).toBe(400);
      expect(response.body.error.details.map((detail: { field: string }) => detail.field)).toEqual([field]);
    }
  });

  it('si el correo no sale, la cuenta queda invitada y la respuesta lo avisa para poder reenviar', async () => {
    failEmails = true;
    const admin = await as('admin-a@example.com');
    const response = await admin.post('/users/invitations', { email: 'sin-correo@example.com', name: 'Sin correo', role: 'user' });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ emailSent: false, user: { status: 'invited' } });

    failEmails = false;
    const resent = await admin.post(`/users/${response.body.data.user.id}/invitations/resend`);
    expect(resent.body.data.emailSent).toBe(true);
    expect((await accept(tokenFromEmail(sent[0]!))).status).toBe(204);
  });
});

describe('rol y último administrador', () => {
  it('cambiar el rol aplica de inmediato y queda en la bitácora', async () => {
    const user = await seedUser('ascenso@example.com', 'user');
    const promoted = await login('ascenso@example.com');
    expect((await request(app).get('/users').set(bearer(promoted.accessToken))).status).toBe(403);

    const admin = await as('admin-a@example.com');
    const response = await admin.patch(`/users/${user.id}/role`, { role: 'admin' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: user.id, role: 'admin' });
    // El token que ya tenía toma el rol nuevo sin volver a iniciar sesión.
    expect((await request(app).get('/users').set(bearer(promoted.accessToken))).status).toBe(200);

    expect((await admin.patch(`/users/${user.id}/role`, { role: 'user' })).body.data.role).toBe('user');
    expect((await request(app).get('/users').set(bearer(promoted.accessToken))).status).toBe(403);
    // Asignar el rol que ya tiene no cambia nada ni deja entrada.
    expect((await admin.patch(`/users/${user.id}/role`, { role: 'user' })).status).toBe(200);
    expect(await auditActions(user.id)).toEqual(['user.role_changed', 'user.role_changed']);
    expect((await admin.patch(`/users/${user.id}/role`, { role: 'manager' })).body.error.code).toBe('VALIDATION_ERROR');
  });

  it('quitar el rol o desactivar al último administrador activo devuelve 409 LAST_ADMIN', async () => {
    const adminB = await as('admin-b@example.com');
    const { id } = (await adminB.get('/me')).body.data.user as PublicUser;
    // Un administrador invitado o desactivado no cuenta: no puede administrar.
    const pending = (await adminB.post('/users/invitations', { email: 'admin-pendiente-b@example.com', name: 'Pendiente', role: 'admin' }))
      .body.data.user as PublicUser;

    for (const response of [await adminB.patch(`/users/${id}/role`, { role: 'user' }), await adminB.post(`/users/${id}/deactivate`)]) {
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('LAST_ADMIN');
    }
    expect(await storedUser(id)).toMatchObject({ role: 'admin', status: 'active' });
    expect(await auditActions(id)).toEqual([]);
    // Al pendiente sí se le puede quitar el rol: no es el último administrador activo.
    expect((await adminB.patch(`/users/${pending.id}/role`, { role: 'user' })).status).toBe(200);
  });

  it('con dos administradores sí se puede quitar el rol a uno, pero no a los dos a la vez', async () => {
    const tenantId = 'tenant-c';
    const [first, second] = await Promise.all([seedUser('admin-c1@example.com', 'admin', tenantId), seedUser('admin-c2@example.com', 'admin', tenantId)]);
    const actor = (user: PublicUser): RequestUser => ({ id: user.id, tenantId, role: 'admin', sessionId: 'test-session' });
    const service = createUsersService(getDatabase(), config, emailSender);

    // Cada uno le quita el rol al otro en el mismo instante: el candado del tenant deja pasar solo a uno.
    const results = await Promise.allSettled([
      service.changeRole(second.id, 'user', actor(first)), service.deactivate(first.id, actor(second)),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { statusCode: 409, code: 'LAST_ADMIN' } });
    const active = await getDatabase().collection(USERS_COLLECTION).countDocuments({ tenantId, role: 'admin', status: 'active' });
    expect(active).toBe(1);
  });

  it('un administrador de otro tenant no modifica usuarios de este', async () => {
    const adminB = await as('admin-b@example.com');
    const target = await seedUser('ajeno@example.com', 'user');
    const responses = await Promise.all([
      adminB.patch(`/users/${target.id}/role`, { role: 'admin' }), adminB.post(`/users/${target.id}/deactivate`),
      adminB.post(`/users/${target.id}/reactivate`), adminB.post(`/users/${target.id}/invitations/resend`),
    ]);
    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404]);
    expect(responses[0].body.error.code).toBe('USER_NOT_FOUND');
    expect(await storedUser(target.id)).toMatchObject({ role: 'user', status: 'active' });
  });
});

describe('desactivar y reactivar', () => {
  it('desactivar revoca las sesiones: ni el refresh ni el access token vigente sirven, y no puede entrar', async () => {
    const user = await seedUser('baja@example.com', 'user');
    const session = await login('baja@example.com');
    expect((await request(app).get('/me').set(bearer(session.accessToken))).status).toBe(200);

    const admin = await as('admin-a@example.com');
    const response = await admin.post(`/users/${user.id}/deactivate`);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: user.id, status: 'deactivated' });

    expect((await refresh(session.refreshToken)).status).toBe(401);
    expect((await request(app).get('/construction/dashboard').set(bearer(session.accessToken))).status).toBe(401);
    expect((await loginAttempt('baja@example.com')).status).toBe(401);

    const again = await admin.post(`/users/${user.id}/deactivate`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_TRANSITION');

    const reactivated = await admin.post(`/users/${user.id}/reactivate`);
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.data.status).toBe('active');
    await login('baja@example.com');
    // Reactivar no revive las sesiones que se cerraron.
    expect((await refresh(session.refreshToken)).status).toBe(401);
    expect((await admin.post(`/users/${user.id}/reactivate`)).body.error.code).toBe('INVALID_TRANSITION');
    expect(await auditActions(user.id)).toEqual(['user.deactivated', 'user.reactivated']);
  });

  it('desactivar una invitación pendiente invalida su enlace; al reactivar vuelve a invited', async () => {
    const user = await invite('pendiente.baja@example.com');
    const token = tokenFromEmail(sent[0]!);
    const admin = await as('admin-a@example.com');

    expect((await admin.post(`/users/${user.id}/deactivate`)).body.data.status).toBe('deactivated');
    expect((await accept(token)).status).toBe(400);
    expect((await admin.post(`/users/${user.id}/reactivate`)).body.data.status).toBe('invited');
    expect((await accept(token)).status).toBe(400);

    await admin.post(`/users/${user.id}/invitations/resend`);
    expect((await accept(tokenFromEmail(sent[1]!))).status).toBe(204);
  });
});

describe('perfil', () => {
  it('PATCH /me cambia el nombre propio y lo registra', async () => {
    const user = await seedUser('perfil@example.com', 'user');
    const me = await as('perfil@example.com');

    const response = await me.patch('/me', { name: '  Nombre Nuevo ', role: 'admin', email: 'otro@example.com' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: user.id, name: 'Nombre Nuevo', role: 'user', email: 'perfil@example.com' });
    expect((await me.get('/me')).body.data.user.name).toBe('Nombre Nuevo');
    expect(await auditActions(user.id)).toEqual(['user.profile_updated']);
    expect((await me.patch('/me', { name: '' })).body.error.code).toBe('VALIDATION_ERROR');
    expect((await request(app).patch('/me').send({ name: 'X' })).status).toBe(401);
  });

  it('cambiar la contraseña con la actual incorrecta devuelve 400 y no cambia nada', async () => {
    const user = await seedUser('clave.mal@example.com', 'user');
    const me = await as('clave.mal@example.com');

    const wrong = await me.post('/me/password', { currentPassword: 'no es la actual', newPassword: NEW_PASSWORD });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    // Mismo esquema de longitud que al restablecer.
    const short = await me.post('/me/password', { currentPassword: PASSWORD, newPassword: 'corta' });
    expect(short.status).toBe(400);
    expect(short.body.error.details[0].field).toBe('newPassword');

    await login('clave.mal@example.com');
    expect(await auditActions(user.id)).toEqual([]);
  });

  it('con la actual correcta cambia la contraseña, cierra las demás sesiones y conserva la actual', async () => {
    const user = await seedUser('clave.bien@example.com', 'user');
    const other = await login('clave.bien@example.com');
    const current = await login('clave.bien@example.com');

    const response = await request(app).post('/me/password').set(bearer(current.accessToken))
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(response.status).toBe(204);

    expect((await request(app).get('/me').set(bearer(other.accessToken))).status).toBe(401);
    expect((await refresh(other.refreshToken)).status).toBe(401);
    expect((await request(app).get('/me').set(bearer(current.accessToken))).status).toBe(200);
    expect((await refresh(current.refreshToken)).status).toBe(200);

    expect((await loginAttempt('clave.bien@example.com', PASSWORD)).status).toBe(401);
    await login('clave.bien@example.com', NEW_PASSWORD);
    expect(await auditActions(user.id)).toEqual(['user.password_changed']);
    const entries = await getDatabase().collection(AUDIT_TRAIL_COLLECTION).find({ entityId: user.id }).toArray();
    expect(JSON.stringify(entries)).not.toMatch(/scrypt|frase nueva/);
  });
});
