import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import request from 'supertest';
import WebSocket from 'ws';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { ServerConfig } from '@erp/config';
import { hoyISO, type CreateObraRequest, type Obra, type RealtimeEvent } from '@erp/domain';
import { createApp } from '../../app';
import { AUDIT_COLLECTION } from '../../core/audit';
import { CLOSE_UNAUTHORIZED, RealtimeHub } from '../../core/realtime';
import { closeDB, connectDB, getDatabase } from '../../config/database';
import { ensureIdentityIndexes } from '../identity/identity.repository';
import { createIdentityService } from '../identity/identity.routes';
import { NoopEmailSender } from '../../platform/integrations/email';

const config = {
  nodeEnv: 'test',
  port: 0,
  mongodbUri: 'set-in-beforeAll',
  jwtSecret: 'test-access-secret',
  jwtExpiresIn: '15m',
  appWebUrl: 'http://web.test',
  defaultTenantId: 'tenant-a',
  corsOrigins: [],
} satisfies ServerConfig;

const PASSWORD = 'correct-horse-battery';
const DIA = 24 * 60 * 60 * 1000;
const fecha = (dias: number) => hoyISO(new Date(Date.now() + dias * DIA));

let mongo: MongoMemoryServer;
let hub: RealtimeHub;
let server: Server;
let app: ReturnType<typeof createApp>;
const tokens: Record<'manager' | 'user' | 'viewer' | 'otherTenant', string> = { manager: '', user: '', viewer: '', otherTenant: '' };

function nuevaObra(overrides: Partial<CreateObraRequest> = {}): Record<string, unknown> {
  return {
    nombre: 'Residencial Alameda',
    cliente: 'Grupo Vértice',
    ubicacion: 'Puebla',
    alcance: '48 viviendas en 4 torres',
    presupuesto: { moneda: 'mxn', total: '42500000', ejercido: '1500.5' },
    certificacion: { tipo: 'LEED', nivelObjetivo: 'Gold' },
    impactoEstimado: { co2EvitadoKg: 120000, energiaAhorradaKwh: 50000, aguaCaptadaM3: 900, descripcion: 'Paneles solares' },
    materiales: [{ nombre: 'Concreto reciclado', proveedor: 'Cemex', origen: 'Puebla', distanciaKm: 12 }],
    fases: [
      { nombre: 'Cimentación', inicio: fecha(-30), fin: fecha(30), avance: 50 },
      { nombre: 'Estructura', inicio: fecha(31), fin: fecha(90), avance: 0 },
    ],
    ...overrides,
  };
}

const as = (role: keyof typeof tokens) => ({ Authorization: `Bearer ${tokens[role]}` });

async function crear(overrides: Partial<CreateObraRequest> = {}): Promise<Obra> {
  const response = await request(app).post('/obras').set(as('manager')).send(nuevaObra(overrides));
  expect(response.status).toBe(201);
  return response.body.data;
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDB(mongo.getUri(), 'erp-obras-test');
  await ensureIdentityIndexes(getDatabase());
  const identity = createIdentityService(getDatabase(), config, new NoopEmailSender());
  const seed: [keyof typeof tokens, 'manager' | 'user' | 'viewer' | 'admin', string][] = [
    ['manager', 'manager', 'tenant-a'], ['user', 'user', 'tenant-a'], ['viewer', 'viewer', 'tenant-a'], ['otherTenant', 'admin', 'tenant-b'],
  ];
  hub = new RealtimeHub(config);
  app = createApp(config, hub.publish);
  for (const [key, role, tenantId] of seed) {
    const email = `${key.toLowerCase()}@example.com`;
    await identity.createUser({ email, name: `Nombre ${key}`, role, password: PASSWORD }, tenantId);
    const login = await request(app).post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = login.body.data.accessToken;
  }
  server = app.listen(0);
  hub.attach(server);
}, 120_000);

afterAll(async () => {
  hub?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  await closeDB();
  await mongo?.stop();
});

describe('POST /obras', () => {
  it('creates a proposal with normalized money and derived fields', async () => {
    const obra = await crear();
    expect(obra).toMatchObject({
      etapa: 'propuesta',
      estado: 'propuesta',
      avance: 25,
      tenantId: 'tenant-a',
      presupuesto: { moneda: 'MXN', total: '42500000.00', ejercido: '1500.50' },
      certificacion: { tipo: 'LEED', nivelObjetivo: 'Gold', estado: 'en_preparacion' },
      impactoMedido: { co2EvitadoKg: 0, energiaAhorradaKwh: 0, aguaCaptadaM3: 0 },
    });
    expect(obra.fases.every((fase) => typeof fase.id === 'string')).toBe(true);
  });

  it('validates the body', async () => {
    const response = await request(app).post('/obras').set(as('manager'))
      .send(nuevaObra({ presupuesto: { moneda: 'MXN', total: '12.345', ejercido: '0' } }));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('forbids a viewer and requires authentication', async () => {
    expect((await request(app).post('/obras').set(as('viewer')).send(nuevaObra())).status).toBe(403);
    expect((await request(app).get('/obras')).status).toBe(401);
  });
});

describe('approval workflow', () => {
  it('moves a work through proposal, execution, certification and completion', async () => {
    const obra = await crear();
    const aprobar = () => request(app).post(`/obras/${obra.id}/aprobar`).set(as('manager')).send({});

    expect((await aprobar()).body.data.etapa).toBe('ejecucion');

    const incompleta = await aprobar();
    expect(incompleta.status).toBe(409);
    expect(incompleta.body.error.code).toBe('OBRA_INCOMPLETA');

    const terminada = await request(app).patch(`/obras/${obra.id}`).set(as('manager'))
      .send({ fases: obra.fases.map((fase) => ({ ...fase, avance: 100 })) });
    expect(terminada.body.data.avance).toBe(100);
    expect((await aprobar()).body.data.estado).toBe('certificando');

    const cambios = await request(app).post(`/obras/${obra.id}/solicitar-cambios`).set(as('manager'))
      .send({ comentario: 'Falta evidencia de agua captada' });
    expect(cambios.body.data.etapa).toBe('ejecucion');

    await aprobar();
    const final = await aprobar();
    expect(final.body.data).toMatchObject({ etapa: 'completada', certificacion: { estado: 'obtenida' } });
    expect(final.body.data.decisiones.map((d: { accion: string }) => d.accion))
      .toEqual(['aprobada', 'aprobada', 'cambios_solicitados', 'aprobada', 'aprobada']);
    expect(final.body.data.decisiones[2]).toMatchObject({ comentario: 'Falta evidencia de agua captada', autor: { nombre: 'Nombre manager' } });
    expect((await aprobar()).body.error.code).toBe('OBRA_COMPLETADA');
  });

  it('requires a comment to request changes and the approve permission', async () => {
    const obra = await crear();
    expect((await request(app).post(`/obras/${obra.id}/solicitar-cambios`).set(as('manager')).send({})).status).toBe(400);
    expect((await request(app).post(`/obras/${obra.id}/aprobar`).set(as('user')).send({})).status).toBe(403);
  });

  it('writes an audit record for every change', async () => {
    const obra = await crear();
    await request(app).post(`/obras/${obra.id}/aprobar`).set(as('manager')).send({ comentario: 'ok' });
    const actions = (await getDatabase().collection(AUDIT_COLLECTION).find({ entityId: obra.id }).toArray()).map((e) => e.action);
    expect(actions).toEqual(['obra.create', 'obra.aprobada']);
  });
});

describe('derived status and measurements', () => {
  it('marks a work in execution as delayed when a phase is overdue', async () => {
    const obra = await crear({ fases: [{ nombre: 'Acabados', inicio: fecha(-60), fin: fecha(-1), avance: 80 }] });
    const enEjecucion = await request(app).post(`/obras/${obra.id}/aprobar`).set(as('manager')).send({});
    expect(enEjecucion.body.data.estado).toBe('retrasada');
    const filtradas = await request(app).get('/obras?estado=retrasada').set(as('viewer'));
    expect(filtradas.body.data.map((o: Obra) => o.id)).toContain(obra.id);
  });

  it('lets a field resident register measurements and sums them as real impact', async () => {
    const obra = await crear();
    const medir = (co2EvitadoKg: number) => request(app).post(`/obras/${obra.id}/mediciones`).set(as('user'))
      .send({ fecha: fecha(0), co2EvitadoKg, energiaAhorradaKwh: 10, aguaCaptadaM3: 0.5, fuente: 'Medidor bimestral' });
    await medir(100.25);
    const response = await medir(50);
    expect(response.status).toBe(201);
    expect(response.body.data.impactoMedido).toEqual({ co2EvitadoKg: 150.25, energiaAhorradaKwh: 20, aguaCaptadaM3: 1 });
    expect(response.body.data.mediciones[0].registradoPor.nombre).toBe('Nombre user');
    expect((await request(app).post(`/obras/${obra.id}/mediciones`).set(as('viewer')).send({})).status).toBe(403);
  });

  it('builds the dashboard summary', async () => {
    const response = await request(app).get('/obras/resumen').set(as('viewer'));
    expect(response.status).toBe(200);
    expect(response.body.data.total).toBeGreaterThan(0);
    expect(response.body.data.presupuesto[0]).toMatchObject({ moneda: 'MXN' });
    expect(response.body.data.impactoMedido.co2EvitadoKg).toBeGreaterThanOrEqual(150.25);
  });
});

describe('tenant isolation', () => {
  it('hides works from other tenants', async () => {
    const obra = await crear();
    expect((await request(app).get(`/obras/${obra.id}`).set(as('otherTenant'))).status).toBe(404);
    const list = await request(app).get('/obras').set(as('otherTenant'));
    expect(list.body.data).toEqual([]);
  });

  it('only lets an admin of the same tenant delete', async () => {
    const obra = await crear();
    expect((await request(app).delete(`/obras/${obra.id}`).set(as('manager'))).status).toBe(403);
    const admin = tokens.otherTenant;
    expect((await request(app).delete(`/obras/${obra.id}`).set({ Authorization: `Bearer ${admin}` })).status).toBe(404);
  });
});

describe('realtime channel', () => {
  function connect(token: string): Promise<{ socket: WebSocket; events: RealtimeEvent[] }> {
    const { port } = server.address() as AddressInfo;
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const events: RealtimeEvent[] = [];
    return new Promise((resolve, reject) => {
      socket.on('open', () => socket.send(JSON.stringify({ type: 'auth', token })));
      socket.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'ready') resolve({ socket, events });
        else events.push(message);
      });
      socket.on('close', (code) => reject(new Error(`closed ${code}`)));
    });
  }

  const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it('pushes changes only to clients of the same tenant', async () => {
    const mismo = await connect(tokens.viewer);
    const otro = await connect(tokens.otherTenant);
    const obra = await crear();
    await esperar(100);
    expect(mismo.events).toContainEqual({ type: 'obra.upsert', obra: expect.objectContaining({ id: obra.id }) });
    expect(otro.events).toEqual([]);
    mismo.socket.close();
    otro.socket.close();
  });

  it('closes unauthenticated connections with 4401', async () => {
    await expect(connect('not-a-token')).rejects.toThrow(`closed ${CLOSE_UNAUTHORIZED}`);
  });
});
