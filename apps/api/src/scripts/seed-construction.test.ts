import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { getDatabase } from '../config/database';
import { api, stopDatabase } from '../test/helpers';
import { startConstruction, tokens, moneyFields } from '../modules/construction/construction.testkit';
import { seedConstruction } from './seed-construction';

let replSet: MongoMemoryReplSet;

type Item = { id: string; name: string; status: string; delayDays: number };

beforeAll(async () => {
  replSet = await startConstruction();
  await seedConstruction(getDatabase(), 'tenant-a', 'seed-admin');
}, 120_000);

afterAll(async () => {
  await stopDatabase(replSet);
});

describe('seed de construcción', () => {
  it('carga cinco obras en estados variados y dos propuestas en revisión, una sola vez', async () => {
    const projects = (await api(tokens.adminA).get('/construction/projects?pageSize=100')).body.data.items as Item[];
    expect(projects.map((project) => [project.name, project.status]).sort()).toEqual([
      ['Casa Manantial', 'completed'], ['Oficinas Raíz', 'certifying'], ['Plaza Origen', 'in_progress'],
      ['Residencial Alameda', 'in_progress'], ['Torre Cedro', 'in_progress'],
    ]);
    const proposals = (await api(tokens.adminA).get('/construction/proposals?status=in_review')).body.data.items as Item[];
    expect(proposals.map((proposal) => proposal.name).sort()).toEqual(['Bodega Norte', 'Centro Comunitario Ahuehuete']);

    expect(await seedConstruction(getDatabase(), 'tenant-a', 'seed-admin')).toBe(false);
    expect((await api(tokens.adminA).get('/construction/projects?pageSize=100')).body.data.total).toBe(5);
  });

  it('Torre Cedro está retrasada, Plaza Origen al 96% y Oficinas Raíz tiene requisitos pendientes', async () => {
    const projects = (await api(tokens.adminA).get('/construction/projects?pageSize=100')).body.data.items as Item[];
    const detail = async (name: string) =>
      (await api(tokens.adminA).get(`/construction/projects/${projects.find((project) => project.name === name)!.id}`)).body.data;

    expect((await detail('Torre Cedro')).delayDays).toBe(10);
    expect((await detail('Plaza Origen')).budget).toEqual({ currentBudget: '18200000.00', spent: '17472000.00', available: '728000.00', spentPct: 96 });
    const raiz = await detail('Oficinas Raíz');
    expect(raiz.requirements.filter((requirement: { status: string }) => requirement.status === 'pending').map((requirement: { code: string }) => requirement.code))
      .toEqual(['LEED-EA', 'LEED-EQ']);
    // El ajuste de Residencial Alameda y su corrección se compensan.
    expect((await detail('Residencial Alameda')).budget.currentBudget).toBe('42500000.00');

    const attention = (await api(tokens.adminA).get('/construction/dashboard')).body.data.attention as { kind: string; name: string }[];
    const names = (kind: string) => attention.filter((item) => item.kind === kind).map((item) => item.name).sort();
    expect(names('proposal_in_review')).toEqual(['Bodega Norte', 'Centro Comunitario Ahuehuete']);
    expect(names('project_delayed')).toEqual(['Torre Cedro']);
    expect(names('budget_near_limit')).toEqual(['Oficinas Raíz', 'Plaza Origen']);
    expect(names('requirement_pending')).toEqual(['Oficinas Raíz', 'Oficinas Raíz']);
  });

  it('la cuenta user ve todo sin montos y sin "Requiere tu atención"', async () => {
    for (const path of ['/construction/dashboard', '/construction/projects', '/construction/proposals']) {
      const { data } = (await api(tokens.userA).get(path)).body;
      expect(moneyFields(data)).toEqual([]);
      expect(data).not.toHaveProperty('attention');
    }
  });
});

// Los criterios de aceptación del bloque, recorridos por la API sobre los datos del seed.
describe('criterios de aceptación', () => {
  const find = async (path: string, name: string, token = tokens.adminA) =>
    ((await api(token).get(`${path}?pageSize=100`)).body.data.items as Item[]).find((item) => item.name === name)!;

  it('user: ve obras y propuestas con porcentajes, sin montos, y ninguna acción le está permitida', async () => {
    const project = await find('/construction/projects', 'Plaza Origen', tokens.userA);
    const proposal = await find('/construction/proposals', 'Bodega Norte', tokens.userA);

    const detail = (await api(tokens.userA).get(`/construction/projects/${project.id}`)).body.data;
    expect(detail.budget).toEqual({ spentPct: 96 });
    expect(moneyFields(detail)).toEqual([]);
    expect(moneyFields((await api(tokens.userA).get(`/construction/proposals/${proposal.id}`)).body.data)).toEqual([]);

    const user = api(tokens.userA);
    const denied = await Promise.all([
      user.post(`/construction/proposals/${proposal.id}/approve`),
      user.post(`/construction/proposals/${proposal.id}/reject`, { reason: 'No' }),
      user.patch(`/construction/projects/${project.id}`, { progressPct: 1 }),
      user.post(`/construction/projects/${project.id}/archive`),
      user.delete(`/construction/projects/${project.id}`),
      user.post(`/construction/projects/${project.id}/budget-movements`, { amount: '1.00', reason: 'No' }),
      user.get(`/construction/projects/${project.id}/budget-movements`),
      user.patch(`/construction/projects/${project.id}/certification/requirements/EDGE-WATER`, { status: 'met' }),
    ]);
    expect(denied.map((response) => response.status)).toEqual(Array(8).fill(403));
  });

  it('admin: aprueba una propuesta, registra y corrige un ajuste, archiva y no puede eliminar con movimientos', async () => {
    const admin = () => api(tokens.adminA);
    expect((await admin().get('/construction/dashboard')).body.data.attention.length).toBeGreaterThan(0);

    // Aprobar: la obra aparece en Planeación con folio OBR.
    const proposal = await find('/construction/proposals', 'Bodega Norte');
    const approved = (await admin().post(`/construction/proposals/${proposal.id}/approve`)).body.data;
    const project = (await admin().get(`/construction/projects/${approved.projectId}`)).body.data;
    expect(project).toMatchObject({ name: 'Bodega Norte', status: 'planning', folio: 'OBR-000006' });
    expect(project.budget.currentBudget).toBe('31400000.00');
    expect((await find('/construction/projects', 'Bodega Norte')).status).toBe('planning');

    // Registrar un ajuste y corregirlo.
    const movements = `/construction/projects/${project.id}/budget-movements`;
    const adjustment = (await admin().post(movements, { amount: '500000.00', reason: 'Ampliación de andenes' })).body.data;
    expect((await admin().get(`/construction/projects/${project.id}`)).body.data.budget.currentBudget).toBe('31900000.00');
    const correction = await admin().post(movements, { amount: '-500000.00', reason: 'Se capturó en la obra equivocada', reversesMovementId: adjustment.id });
    expect(correction.status).toBe(201);
    expect((await admin().get(`/construction/projects/${project.id}`)).body.data.budget.currentBudget).toBe('31400000.00');

    // Con movimientos ya no se puede eliminar; sí archivar.
    const removal = await admin().delete(`/construction/projects/${project.id}`);
    expect([removal.status, removal.body.error.code]).toEqual([409, 'PROJECT_HAS_MOVEMENTS']);
    expect((await admin().post(`/construction/projects/${project.id}/archive`)).status).toBe(200);
    expect(await find('/construction/projects', 'Bodega Norte')).toBeUndefined();
    expect(((await admin().get('/construction/projects?archived=true')).body.data.items as Item[]).map((item) => item.name)).toEqual(['Bodega Norte']);
  });
});
