import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { AUDIT_TRAIL_COLLECTION } from '../../../core/audit';
import { COUNTERS_COLLECTION } from '../../../core/counters';
import { getDatabase } from '../../../config/database';
import { api, stopDatabase } from '../../../test/helpers';
import { BUDGET_MOVEMENTS_COLLECTION, BudgetMovementsRepository } from '../budget/budget.repository';
import { createProposal, moneyFields, startConstruction, tokens } from '../construction.testkit';
import { PROJECTS_COLLECTION } from '../projects/projects.repository';
import { PROPOSALS_COLLECTION } from './proposals.repository';

let replSet: MongoMemoryReplSet;

const count = (collection: string, filter: object = {}) => getDatabase().collection(collection).countDocuments(filter);
const counter = async (series: string) =>
  (await getDatabase().collection(COUNTERS_COLLECTION).findOne({ tenantId: 'tenant-a', series }))?.value ?? 0;

beforeAll(async () => {
  replSet = await startConstruction();
}, 120_000);

afterAll(async () => {
  await stopDatabase(replSet);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('aprobar una propuesta', () => {
  it('crea la obra en planeación, el movimiento inicial y las entradas de bitácora', async () => {
    const proposal = await createProposal({ name: 'Bodega Norte', estimatedBudget: '31400000.00', certification: 'LEED', level: 'Silver' });

    const response = await api(tokens.adminA).post(`/construction/proposals/${proposal._id}/approve`);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'approved', estimatedBudget: '31400000.00' });
    const { projectId } = response.body.data as { projectId: string };

    const project = (await api(tokens.adminA).get(`/construction/projects/${projectId}`)).body.data;
    expect(project).toMatchObject({
      name: 'Bodega Norte',
      status: 'planning',
      proposalId: proposal._id,
      progressPct: 0,
      certification: { type: 'LEED', level: 'Silver' },
      budget: { currentBudget: '31400000.00', spent: '0.00', available: '31400000.00', spentPct: 0 },
      deletable: true,
    });
    expect(project.folio).toMatch(/^OBR-\d{6}$/);
    expect(project.requirements).toHaveLength(6);
    expect(project.requirements.every((requirement: { status: string }) => requirement.status === 'pending')).toBe(true);

    const movements = (await api(tokens.adminA).get(`/construction/projects/${projectId}/budget-movements`)).body.data;
    expect(movements.total).toBe(1);
    expect(movements.items[0]).toMatchObject({ kind: 'initial_budget', amount: '31400000.00', reversesMovementId: null });
    expect(movements.items[0].folio).toMatch(/^MOV-\d{6}$/);

    const audit = await getDatabase().collection(AUDIT_TRAIL_COLLECTION).find({ tenantId: 'tenant-a' }).toArray();
    expect(audit.filter((entry) => entry.entityId === proposal._id).map((entry) => entry.action)).toEqual(['proposal.approved']);
    expect(audit.filter((entry) => entry.entityId === projectId).map((entry) => entry.action).sort())
      .toEqual(['budget.initial', 'project.created']);
    expect(audit.every((entry) => entry.actorId && entry.summary && entry.at instanceof Date)).toBe(true);
  });

  it('aprobar dos veces devuelve 409 INVALID_TRANSITION y no crea otra obra', async () => {
    const proposal = await createProposal({ name: 'Doble aprobación' });
    expect((await api(tokens.adminA).post(`/construction/proposals/${proposal._id}/approve`)).status).toBe(200);

    const second = await api(tokens.adminA).post(`/construction/proposals/${proposal._id}/approve`);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('INVALID_TRANSITION');
    expect(await count(PROJECTS_COLLECTION, { proposalId: proposal._id })).toBe(1);
  });

  it('dos aprobaciones simultáneas crean una sola obra', async () => {
    const proposal = await createProposal({ name: 'Aprobación concurrente' });
    const responses = await Promise.all([1, 2, 3].map(() => api(tokens.adminA).post(`/construction/proposals/${proposal._id}/approve`)));

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409, 409]);
    expect(await count(PROJECTS_COLLECTION, { proposalId: proposal._id })).toBe(1);
  });

  it('si falla a mitad de la operación no queda nada guardado', async () => {
    const proposal = await createProposal({ name: 'Falla a mitad' });
    const before = {
      projects: await count(PROJECTS_COLLECTION), movements: await count(BUDGET_MOVEMENTS_COLLECTION),
      audit: await count(AUDIT_TRAIL_COLLECTION), obr: await counter('OBR'), mov: await counter('MOV'),
    };
    // Para entonces ya se aprobó la propuesta, se tomó el folio OBR y se insertó la obra.
    jest.spyOn(BudgetMovementsRepository.prototype, 'insert').mockRejectedValueOnce(new Error('forced failure'));

    const response = await api(tokens.adminA).post(`/construction/proposals/${proposal._id}/approve`);
    expect(response.status).toBe(500);

    const stored = await getDatabase().collection(PROPOSALS_COLLECTION).findOne({ _id: proposal._id as never });
    expect(stored).toMatchObject({ status: 'in_review', decidedAt: null, decidedBy: null, projectId: null });
    expect({
      projects: await count(PROJECTS_COLLECTION), movements: await count(BUDGET_MOVEMENTS_COLLECTION),
      audit: await count(AUDIT_TRAIL_COLLECTION), obr: await counter('OBR'), mov: await counter('MOV'),
    }).toEqual(before);

    // Sin el fallo, la misma propuesta se aprueba y toma el folio que no se consumió.
    const retry = await api(tokens.adminA).post(`/construction/proposals/${proposal._id}/approve`);
    expect(retry.status).toBe(200);
    expect(await counter('OBR')).toBe(before.obr + 1);
  });
});

describe('rechazar una propuesta', () => {
  it('sin motivo devuelve VALIDATION_ERROR con el detalle del campo', async () => {
    const proposal = await createProposal({ name: 'Rechazo sin motivo' });
    for (const body of [{}, { reason: '   ' }]) {
      const response = await api(tokens.adminA).post(`/construction/proposals/${proposal._id}/reject`, body);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details[0].field).toBe('reason');
    }
    expect((await api(tokens.adminA).get(`/construction/proposals/${proposal._id}`)).body.data.status).toBe('in_review');
  });

  it('guarda el motivo, lo registra en la bitácora y no crea obra', async () => {
    const proposal = await createProposal({ name: 'Rechazo con motivo' });
    const response = await api(tokens.adminA).post(`/construction/proposals/${proposal._id}/reject`, { reason: 'Falta el estudio de suelo' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'rejected', rejectionReason: 'Falta el estudio de suelo', projectId: null });
    expect(response.body.data.decidedAt).toEqual(expect.any(String));
    expect(await count(PROJECTS_COLLECTION, { proposalId: proposal._id })).toBe(0);
    const [entry] = await getDatabase().collection(AUDIT_TRAIL_COLLECTION).find({ entityId: proposal._id }).toArray();
    expect(entry).toMatchObject({ action: 'proposal.rejected', entityType: 'proposal', tenantId: 'tenant-a' });
    expect(entry.summary).toContain('Falta el estudio de suelo');
  });

  it('solo se decide desde en revisión: 409 INVALID_TRANSITION en cualquier otro estado', async () => {
    const draft = await createProposal({ name: 'Borrador', status: 'draft' });
    const rejected = await createProposal({ name: 'Ya rechazada' });
    await api(tokens.adminA).post(`/construction/proposals/${rejected._id}/reject`, { reason: 'Fuera de presupuesto' });

    for (const [id, action, body] of [
      [draft._id, 'approve', {}], [draft._id, 'reject', { reason: 'x' }], [rejected._id, 'approve', {}], [rejected._id, 'reject', { reason: 'x' }],
    ] as const) {
      const response = await api(tokens.adminA).post(`/construction/proposals/${id}/${action}`, body);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_TRANSITION');
    }
  });
});

describe('permisos y montos', () => {
  it('un user recibe 403 al aprobar y al rechazar', async () => {
    const proposal = await createProposal({ name: 'Permisos' });
    for (const [action, body] of [['approve', {}], ['reject', { reason: 'No' }]] as const) {
      const response = await api(tokens.userA).post(`/construction/proposals/${proposal._id}/${action}`, body);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    }
    expect((await api(tokens.adminA).get(`/construction/proposals/${proposal._id}`)).body.data.status).toBe('in_review');
  });

  it('para un user el detalle y el listado no contienen ningún monto; para un admin sí', async () => {
    const proposal = await createProposal({ name: 'Montos', estimatedBudget: '12800000.00' });

    const userDetail = (await api(tokens.userA).get(`/construction/proposals/${proposal._id}`)).body.data;
    expect(userDetail).toMatchObject({ name: 'Montos', targets: { energySavingPct: 25 } });
    expect(moneyFields(userDetail)).toEqual([]);
    const userList = (await api(tokens.userA).get('/construction/proposals?status=in_review&pageSize=100')).body.data;
    expect(userList.items.length).toBeGreaterThan(0);
    expect(moneyFields(userList)).toEqual([]);

    const adminDetail = (await api(tokens.adminA).get(`/construction/proposals/${proposal._id}`)).body.data;
    expect(adminDetail.estimatedBudget).toBe('12800000.00');
    expect(moneyFields(adminDetail)).toEqual(['estimatedBudget']);
    const adminList = (await api(tokens.adminA).get('/construction/proposals?status=in_review&pageSize=100')).body.data;
    expect(adminList.items.find((item: { id: string }) => item.id === proposal._id).estimatedBudget).toBe('12800000.00');
  });
});

describe('listado y aislamiento entre tenants', () => {
  it('filtra por estado y pagina', async () => {
    await createProposal({ name: 'Borrador para filtro', status: 'draft' });
    const drafts = (await api(tokens.adminA).get('/construction/proposals?status=draft&pageSize=100')).body.data;
    expect(drafts.items.length).toBeGreaterThan(0);
    expect(drafts.items.every((item: { status: string; submittedAt: string | null }) => item.status === 'draft' && item.submittedAt === null)).toBe(true);

    const page = (await api(tokens.adminA).get('/construction/proposals?page=1&pageSize=2')).body.data;
    expect(page).toMatchObject({ page: 1, pageSize: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.total).toBeGreaterThan(2);
    expect((await api(tokens.adminA).get('/construction/proposals?status=nope')).body.error.code).toBe('VALIDATION_ERROR');
  });

  it('el tenant B no ve ni decide propuestas del tenant A', async () => {
    const proposal = await createProposal({ name: 'Solo del tenant A' });
    await createProposal({ name: 'Solo del tenant B' }, 'tenant-b');

    expect((await api(tokens.adminB).get(`/construction/proposals/${proposal._id}`)).status).toBe(404);
    expect((await api(tokens.adminB).post(`/construction/proposals/${proposal._id}/approve`)).status).toBe(404);
    expect((await api(tokens.adminB).post(`/construction/proposals/${proposal._id}/reject`, { reason: 'x' })).status).toBe(404);

    const listB = (await api(tokens.adminB).get('/construction/proposals?pageSize=100')).body.data;
    expect(listB.items.map((item: { name: string }) => item.name)).toEqual(['Solo del tenant B']);
    const listA = (await api(tokens.adminA).get('/construction/proposals?pageSize=100')).body.data;
    expect(listA.items.map((item: { name: string }) => item.name)).not.toContain('Solo del tenant B');
    // Cada tenant lleva su propia serie de folios.
    expect(listB.items[0].folio).toBe('PRO-000001');
  });

  it('sin sesión responde 401', async () => {
    expect((await api('').get('/construction/proposals')).status).toBe(401);
  });
});
