import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { computeDelayDays, type PhaseStatus } from '@erp/domain';
import { getDatabase } from '../../../config/database';
import { api, createUserAndLogin, stopDatabase } from '../../../test/helpers';
import { BUDGET_MOVEMENTS_COLLECTION } from '../budget/budget.repository';
import { createProject, createProposal, dayFromNow, moneyFields, startConstruction, tokens } from '../construction.testkit';
import { PROJECTS_COLLECTION } from './projects.repository';

let replSet: MongoMemoryReplSet;

type Item = { id: string; name: string };

const projectPath = (id: string) => `/construction/projects/${id}`;
const listNames = async (query = '', token = tokens.adminA) =>
  ((await api(token).get(`/construction/projects?pageSize=100${query}`)).body.data.items as Item[]).map((item) => item.name);
const dashboard = async (token = tokens.adminA) => (await api(token).get('/construction/dashboard')).body.data;
const adjust = (projectId: string, amount: string) =>
  api(tokens.adminA).post(`${projectPath(projectId)}/budget-movements`, { amount, reason: 'Ajuste de prueba' });

beforeAll(async () => {
  replSet = await startConstruction();
}, 120_000);

afterAll(async () => {
  await stopDatabase(replSet);
});

describe('retraso (delayDays)', () => {
  const phase = (status: PhaseStatus, plannedEnd: string) => ({ status, plannedEnd });
  const now = new Date('2026-10-02T15:00:00Z');

  it('cuenta los días desde el fin planeado de la fase en curso, con fechas controladas', () => {
    expect(computeDelayDays([phase('completed', '2026-06-30'), phase('in_progress', '2026-09-22')], now)).toBe(10);
    expect(computeDelayDays([phase('in_progress', '2026-10-01')], now)).toBe(1);
    expect(computeDelayDays([phase('in_progress', '2025-10-02')], now)).toBe(365);
  });

  it('es 0 si la fase en curso está en plazo, si vence hoy o si no hay fase en curso', () => {
    expect(computeDelayDays([phase('in_progress', '2026-10-02')], now)).toBe(0);
    expect(computeDelayDays([phase('in_progress', '2026-12-31')], now)).toBe(0);
    expect(computeDelayDays([phase('completed', '2026-01-31'), phase('pending', '2026-03-31')], now)).toBe(0);
    expect(computeDelayDays([], now)).toBe(0);
  });

  it('una fase completa o pendiente ya vencida no cuenta: solo la fase en curso', () => {
    expect(computeDelayDays([phase('completed', '2026-01-31'), phase('in_progress', '2026-11-30'), phase('pending', '2026-02-28')], now)).toBe(0);
  });

  it('la API devuelve delayDays en el detalle, el listado y "Requiere tu atención"', async () => {
    const delayed = await createProject({
      name: 'Retrasada 7 días',
      phases: [{ key: 'structure', name: 'Estructura', plannedStart: dayFromNow(-90), plannedEnd: dayFromNow(-7), status: 'in_progress' }],
    });
    const onTime = await createProject({ name: 'En plazo' });

    expect((await api(tokens.userA).get(projectPath(delayed._id))).body.data.delayDays).toBe(7);
    expect((await api(tokens.userA).get(projectPath(onTime._id))).body.data.delayDays).toBe(0);
    const { items } = (await api(tokens.userA).get('/construction/projects?pageSize=100')).body.data;
    expect(items.find((item: Item) => item.id === delayed._id).delayDays).toBe(7);

    const attention = (await dashboard()).attention as { kind: string; projectId: string; delayDays: number }[];
    const delays = attention.filter((item) => item.kind === 'project_delayed');
    expect(delays.find((item) => item.projectId === delayed._id)?.delayDays).toBe(7);
    expect(delays.find((item) => item.projectId === onTime._id)).toBeUndefined();
  });
});

describe('permisos y montos', () => {
  it('un user recibe 403 en editar, cambiar estado, archivar, desarchivar y eliminar', async () => {
    const project = await createProject({ name: 'Permisos' });
    const calls = [
      api(tokens.userA).patch(projectPath(project._id), { name: 'Otro nombre' }),
      api(tokens.userA).post(`${projectPath(project._id)}/transition`, { to: 'certifying' }),
      api(tokens.userA).post(`${projectPath(project._id)}/archive`),
      api(tokens.userA).post(`${projectPath(project._id)}/unarchive`),
      api(tokens.userA).delete(projectPath(project._id)),
    ];
    for (const response of await Promise.all(calls)) {
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    }
    expect((await api(tokens.userA).get(projectPath(project._id))).body.data).toMatchObject({ name: 'Permisos', status: 'in_progress', archivedAt: null });
  });

  it('para un user el detalle, el listado y el dashboard no contienen ningún monto; solo porcentajes', async () => {
    const project = await createProject({
      name: 'Sin montos', initialBudget: '18200000.00', movements: [{ kind: 'expense', amount: '17472000.00', reason: 'Estimaciones' }],
    });

    const detail = (await api(tokens.userA).get(projectPath(project._id))).body.data;
    expect(detail.budget).toEqual({ spentPct: 96 });
    expect(moneyFields(detail)).toEqual([]);
    expect(moneyFields((await api(tokens.userA).get('/construction/projects?pageSize=100')).body.data)).toEqual([]);
    expect(moneyFields((await api(tokens.userA).get(`${projectPath(project._id)}/activity`)).body.data)).toEqual([]);
    const userDashboard = await dashboard(tokens.userA);
    expect(moneyFields(userDashboard)).toEqual([]);
    expect(userDashboard).not.toHaveProperty('attention');
    expect(userDashboard.kpis).toEqual(expect.objectContaining({ budgetSpentPct: expect.any(Number) }));

    const adminDetail = (await api(tokens.adminA).get(projectPath(project._id))).body.data;
    expect(adminDetail.budget).toEqual({ currentBudget: '18200000.00', spent: '17472000.00', available: '728000.00', spentPct: 96 });
  });
});

describe('aislamiento entre tenants', () => {
  it('un usuario del tenant B recibe 404 al pedir u operar una obra del tenant A', async () => {
    const project = await createProject({ name: 'Solo del tenant A' });
    const calls = [
      api(tokens.adminB).get(projectPath(project._id)),
      api(tokens.adminB).patch(projectPath(project._id), { name: 'Ajena' }),
      api(tokens.adminB).post(`${projectPath(project._id)}/transition`, { to: 'certifying' }),
      api(tokens.adminB).post(`${projectPath(project._id)}/archive`),
      api(tokens.adminB).delete(projectPath(project._id)),
      api(tokens.adminB).get(`${projectPath(project._id)}/activity`),
    ];
    for (const response of await Promise.all(calls)) {
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('PROJECT_NOT_FOUND');
    }
    expect((await api(tokens.adminA).get(projectPath(project._id))).body.data.name).toBe('Solo del tenant A');
  });

  it('los listados y el dashboard nunca mezclan tenants', async () => {
    await createProject({ name: 'Obra de A' });
    await createProject({ name: 'Obra de B' }, 'tenant-b');

    expect(await listNames('', tokens.adminB)).toEqual(['Obra de B']);
    expect(await listNames()).not.toContain('Obra de B');
    const dashboardB = await dashboard(tokens.adminB);
    expect(dashboardB.kpis.activeProjects).toBe(1);
    expect(dashboardB.projectsInProgress.map((item: Item) => item.name)).toEqual(['Obra de B']);
  });
});

describe('listado', () => {
  it('filtra por estado y busca por nombre o cliente', async () => {
    await createProject({ name: 'Plaza Origen', client: 'Municipio Tlaxcala', status: 'planning' });
    await createProject({ name: 'Casa Manantial', client: 'Familia Ríos', status: 'completed', progressPct: 100 });

    expect(await listNames('&status=planning')).toContain('Plaza Origen');
    expect(await listNames('&status=planning')).not.toContain('Casa Manantial');
    expect(await listNames('&q=origen')).toEqual(['Plaza Origen']);
    expect(await listNames('&q=familia')).toEqual(['Casa Manantial']);
    expect(await listNames('&q=.*')).toEqual([]);
    expect((await api(tokens.adminA).get('/construction/projects?status=delayed')).body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('editar y transiciones', () => {
  it('actualiza datos generales, fases y avance; no acepta campos ajenos', async () => {
    const project = await createProject({ name: 'Editable' });
    const response = await api(tokens.adminA).patch(projectPath(project._id), {
      name: 'Editada',
      progressPct: 55,
      phases: [{ name: 'Acabados', plannedStart: '2026-11-01', plannedEnd: '2027-02-28', status: 'pending' }],
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ name: 'Editada', progressPct: 55, deliveryDate: '2027-02-28', status: 'in_progress' });
    expect(response.body.data.phases[0]).toMatchObject({ name: 'Acabados', key: expect.any(String) });

    for (const body of [{ status: 'completed' }, { folio: 'OBR-999999' }, {}, { progressPct: 101 },
      { phases: [{ name: 'Mal', plannedStart: '2027-01-02', plannedEnd: '2027-01-01', status: 'pending' }] }]) {
      const invalid = await api(tokens.adminA).patch(projectPath(project._id), body);
      expect([invalid.status, invalid.body.error.code]).toEqual([400, 'VALIDATION_ERROR']);
    }
  });

  it('sigue el ciclo planning → in_progress → certifying → completed', async () => {
    const project = await createProject({ name: 'Ciclo completo', status: 'planning' });
    for (const to of ['in_progress', 'certifying', 'completed']) {
      const response = await api(tokens.adminA).post(`${projectPath(project._id)}/transition`, { to });
      expect([response.status, response.body.data.status]).toEqual([200, to]);
    }
    const activity = (await api(tokens.userA).get(`${projectPath(project._id)}/activity`)).body.data;
    expect(activity.items.filter((entry: { action: string }) => entry.action === 'project.status_changed')).toHaveLength(3);
    expect(activity.items[0]).toMatchObject({ summary: 'Cambió el estado de Certificando a Completada', actorName: 'admin-a@example.com' });
  });

  it('una transición inválida devuelve 409 INVALID_TRANSITION y no cambia el estado', async () => {
    const project = await createProject({ name: 'Transición inválida', status: 'planning' });
    for (const to of ['certifying', 'completed', 'planning']) {
      const response = await api(tokens.adminA).post(`${projectPath(project._id)}/transition`, { to });
      expect([response.status, response.body.error.code]).toEqual([409, 'INVALID_TRANSITION']);
    }
    const unknown = await api(tokens.adminA).post(`${projectPath(project._id)}/transition`, { to: 'delayed' });
    expect([unknown.status, unknown.body.error.code]).toEqual([400, 'VALIDATION_ERROR']);
    expect((await api(tokens.adminA).get(projectPath(project._id))).body.data.status).toBe('planning');
  });
});

describe('archivar', () => {
  it('saca la obra del listado por defecto y de los KPIs; desarchivar la regresa', async () => {
    const project = await createProject({ name: 'Para archivar' });
    const before = (await dashboard()).kpis.activeProjects;

    const archived = await api(tokens.adminA).post(`${projectPath(project._id)}/archive`);
    expect(archived.status).toBe(200);
    expect(archived.body.data.archivedAt).toEqual(expect.any(String));

    expect(await listNames()).not.toContain('Para archivar');
    expect(await listNames('&archived=true')).toEqual(['Para archivar']);
    const after = await dashboard();
    expect(after.kpis.activeProjects).toBe(before - 1);
    expect(after.projectsInProgress.map((item: Item) => item.name)).not.toContain('Para archivar');
    // Sigue consultable: su historial y movimientos se conservan.
    expect((await api(tokens.adminA).get(projectPath(project._id))).status).toBe(200);
    expect((await api(tokens.adminA).get(`${projectPath(project._id)}/budget-movements`)).body.data.total).toBe(1);

    const again = await api(tokens.adminA).post(`${projectPath(project._id)}/archive`);
    expect([again.status, again.body.error.code]).toEqual([409, 'PROJECT_ALREADY_ARCHIVED']);

    expect((await api(tokens.adminA).post(`${projectPath(project._id)}/unarchive`)).body.data.archivedAt).toBeNull();
    expect(await listNames()).toContain('Para archivar');
    expect((await dashboard()).kpis.activeProjects).toBe(before);
  });

  it('el listado de archivadas exige construction.projects:archive', async () => {
    const response = await api(tokens.userA).get('/construction/projects?archived=true');
    expect([response.status, response.body.error.code]).toEqual([403, 'FORBIDDEN']);
  });
});

describe('eliminar', () => {
  it('con ajustes devuelve 409 PROJECT_HAS_MOVEMENTS y deletable es false', async () => {
    const project = await createProject({ name: 'Con ajustes' });
    expect((await api(tokens.adminA).get(projectPath(project._id))).body.data.deletable).toBe(true);
    expect((await adjust(project._id, '500.00')).status).toBe(201);
    expect((await api(tokens.adminA).get(projectPath(project._id))).body.data.deletable).toBe(false);

    const response = await api(tokens.adminA).delete(projectPath(project._id));
    expect([response.status, response.body.error.code]).toEqual([409, 'PROJECT_HAS_MOVEMENTS']);
    const stored = await getDatabase().collection(PROJECTS_COLLECTION).findOne({ _id: project._id as never });
    expect(stored?.deletedAt).toBeNull();
  });

  it('con gastos también se bloquea, aunque el ajuste se haya corregido', async () => {
    const withExpense = await createProject({ name: 'Con gastos', movements: [{ kind: 'expense', amount: '10.00', reason: 'Gasto' }] });
    expect((await api(tokens.adminA).delete(projectPath(withExpense._id))).body.error.code).toBe('PROJECT_HAS_MOVEMENTS');

    const corrected = await createProject({
      name: 'Ajuste corregido',
      movements: [{ kind: 'adjustment', amount: '10.00', reason: 'Error' }, { kind: 'adjustment', amount: '-10.00', reason: 'Corrección', reverses: 0 }],
    });
    expect((await api(tokens.adminA).delete(projectPath(corrected._id))).body.error.code).toBe('PROJECT_HAS_MOVEMENTS');
  });

  it('sin ajustes la marca con deletedAt y deletedBy, y conserva sus movimientos', async () => {
    const proposal = await createProposal({ name: 'Recién aprobada' });
    const { projectId } = (await api(tokens.adminA).post(`/construction/proposals/${proposal._id}/approve`)).body.data;

    expect((await api(tokens.adminA).delete(projectPath(projectId))).status).toBe(204);

    const stored = await getDatabase().collection(PROJECTS_COLLECTION).findOne({ _id: projectId as never });
    expect(stored?.deletedAt).toBeInstanceOf(Date);
    expect(stored?.deletedBy).toEqual(expect.any(String));
    expect(await getDatabase().collection(BUDGET_MOVEMENTS_COLLECTION).countDocuments({ projectId })).toBe(1);
    expect((await api(tokens.adminA).get(projectPath(projectId))).status).toBe(404);
    expect(await listNames()).not.toContain('Recién aprobada');
    expect((await api(tokens.adminA).delete(projectPath(projectId))).status).toBe(404);
    // Ya eliminada, tampoco admite movimientos nuevos.
    expect((await adjust(projectId, '1.00')).status).toBe(404);
  });
});

describe('dashboard', () => {
  it('"Requiere tu atención" reúne propuestas en revisión, retrasos, presupuesto al 90% y requisitos pendientes', async () => {
    const proposal = await createProposal({ name: 'Pendiente de decisión' });
    const nearLimit = await createProject({
      name: 'Al 96%', initialBudget: '100.00', movements: [{ kind: 'expense', amount: '96.00', reason: 'Gasto' }],
    });
    const below = await createProject({
      name: 'Al 89%', initialBudget: '100.00', movements: [{ kind: 'expense', amount: '89.00', reason: 'Gasto' }],
    });
    const certifying = await createProject({
      name: 'Certificando', status: 'certifying', certification: 'EDGE', requirements: { 'EDGE-ENERGY': 'met', 'EDGE-WATER': 'in_review' },
    });

    const data = await dashboard();
    const attention = data.attention as Record<string, unknown>[];
    expect(attention).toContainEqual(expect.objectContaining({ kind: 'proposal_in_review', proposalId: proposal._id, name: 'Pendiente de decisión' }));
    expect(attention).toContainEqual({ kind: 'budget_near_limit', projectId: nearLimit._id, folio: nearLimit.folio, name: 'Al 96%', spentPct: 96 });
    expect(attention.find((item) => item.projectId === below._id && item.kind === 'budget_near_limit')).toBeUndefined();
    expect(attention.filter((item) => item.projectId === certifying._id && item.kind === 'requirement_pending').map((item) => item.code))
      .toEqual(['EDGE-MATERIALS']);
    expect(moneyFields(attention)).toEqual([]);

    expect(data.certificationsInProgress).toContainEqual({
      projectId: certifying._id, projectName: 'Certificando', type: 'EDGE', level: 'EDGE Advanced', requirementsMet: 1, requirementsTotal: 3,
    });
    expect(data.kpis).toEqual({
      activeProjects: expect.any(Number), averageProgressPct: expect.any(Number), co2TonsPerYear: expect.any(Number), budgetSpentPct: expect.any(Number),
    });
  });

  it('los KPIs salen de agregaciones: obras activas, avance promedio, CO₂ y porcentaje ejercido', async () => {
    const tenantId = 'tenant-kpis';
    const token = await createUserAndLogin('admin-kpis@example.com', 'admin', tenantId);
    await createProject({ name: 'A', progressPct: 30, initialBudget: '100.00', movements: [{ kind: 'expense', amount: '50.00', reason: 'Gasto' }], impact: { co2TonsPerYear: 100, energySavingPct: 20, waterM3PerYear: 10 } }, tenantId);
    await createProject({ name: 'B', progressPct: 61, status: 'planning', initialBudget: '300.00', movements: [{ kind: 'expense', amount: '50.00', reason: 'Gasto' }], impact: { co2TonsPerYear: 50, energySavingPct: 20, waterM3PerYear: 10 } }, tenantId);
    await createProject({ name: 'C', progressPct: 100, status: 'completed', initialBudget: '100.00', movements: [{ kind: 'expense', amount: '100.00', reason: 'Gasto' }], impact: { co2TonsPerYear: 25, energySavingPct: 20, waterM3PerYear: 10 } }, tenantId);

    // Activas: A y B (C está completada). Avance: (30 + 61) / 2 = 45.5 → 46. Ejercido: 200 de 500 = 40%.
    expect((await dashboard(token)).kpis).toEqual({ activeProjects: 2, averageProgressPct: 46, co2TonsPerYear: 175, budgetSpentPct: 40 });
  });
});
