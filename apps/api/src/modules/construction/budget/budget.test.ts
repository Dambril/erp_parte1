import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { AUDIT_TRAIL_COLLECTION } from '../../../core/audit';
import { getDatabase } from '../../../config/database';
import { api, listRoutes, stopDatabase } from '../../../test/helpers';
import type { ConstructionServices } from '../construction.container';
import { createProject, startConstruction, tokens } from '../construction.testkit';
import { BudgetMovementsRepository } from './budget.repository';
import { budgetRoutes } from './budget.routes';

let replSet: MongoMemoryReplSet;

type Movement = { id: string; folio: string; kind: string; amount: string; reversesMovementId: string | null; reversed: boolean };

const movementsPath = (projectId: string) => `/construction/projects/${projectId}/budget-movements`;
const adjust = (projectId: string, body: object, token = tokens.adminA) => api(token).post(movementsPath(projectId), body);

async function adjustment(projectId: string, amount: string, reason = 'Cambio de alcance'): Promise<Movement> {
  const response = await adjust(projectId, { amount, reason });
  if (response.status !== 201) throw new Error(`adjust → ${response.status} ${JSON.stringify(response.body)}`);
  return response.body.data;
}

const budgetOf = async (projectId: string) => (await api(tokens.adminA).get(`/construction/projects/${projectId}`)).body.data.budget;

beforeAll(async () => {
  replSet = await startConstruction();
}, 120_000);

afterAll(async () => {
  await stopDatabase(replSet);
});

describe('movimientos inmutables', () => {
  it('no existe ruta ni método de repository para editar o borrar un movimiento', async () => {
    const routes = listRoutes(budgetRoutes(() => ({}) as ConstructionServices));
    expect(routes.sort()).toEqual(['get /', 'post /']);
    expect(Object.getOwnPropertyNames(BudgetMovementsRepository.prototype).filter((name) => /update|delete|remove|set/i.test(name))).toEqual([]);

    const project = await createProject({ name: 'Inmutable' });
    const movement = await adjustment(project._id, '500.00');
    for (const method of ['patch', 'put', 'delete'] as const) {
      expect((await api(tokens.adminA)[method](`${movementsPath(project._id)}/${movement.id}`)).status).toBe(404);
      expect((await api(tokens.adminA)[method](movementsPath(project._id))).status).toBe(404);
    }
    expect((await budgetOf(project._id)).currentBudget).toBe('1000500.00');
  });
});

describe('presupuesto derivado de los movimientos', () => {
  it('suma con exactitud decimal: 0.10 + 0.20 = 0.30', async () => {
    const project = await createProject({ name: 'Exactitud', initialBudget: '0.00' });
    await adjustment(project._id, '0.10');
    await adjustment(project._id, '0.20');

    expect(await budgetOf(project._id)).toEqual({ currentBudget: '0.30', spent: '0.00', available: '0.30', spentPct: 0 });
  });

  it('presupuesto vigente = inicial + ajustes; gastado = gastos; disponible = la diferencia', async () => {
    const project = await createProject({
      name: 'Derivado', initialBudget: '17000000.00',
      movements: [
        { kind: 'adjustment', amount: '1200000.00', reason: 'Ampliación' },
        { kind: 'expense', amount: '17472000.00', reason: 'Estimaciones pagadas' },
      ],
    });
    expect(await budgetOf(project._id)).toEqual({ currentBudget: '18200000.00', spent: '17472000.00', available: '728000.00', spentPct: 96 });

    await adjustment(project._id, '-200000.00', 'Recorte');
    expect(await budgetOf(project._id)).toMatchObject({ currentBudget: '18000000.00', available: '528000.00', spentPct: 97 });
  });

  it('el historial lista los movimientos del más reciente al más antiguo, paginado', async () => {
    const project = await createProject({ name: 'Historial' });
    await adjustment(project._id, '100.00');
    await adjustment(project._id, '-40.00');

    const page = (await api(tokens.adminA).get(movementsPath(project._id))).body.data;
    expect(page.total).toBe(3);
    expect(page.items.map((item: Movement) => [item.kind, item.amount]))
      .toEqual([['adjustment', '-40.00'], ['adjustment', '100.00'], ['initial_budget', '1000000.00']]);
    const second = (await api(tokens.adminA).get(`${movementsPath(project._id)}?page=2&pageSize=2`)).body.data;
    expect(second.items).toHaveLength(1);
  });
});

describe('registrar un ajuste', () => {
  it('siempre crea un adjustment y lo registra en la bitácora sin montos', async () => {
    const project = await createProject({ name: 'Ajuste' });
    const response = await adjust(project._id, { amount: '250000.00', reason: 'Cambio de alcance', kind: 'expense' });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ kind: 'adjustment', amount: '250000.00', reason: 'Cambio de alcance', reversed: false });
    const entries = await getDatabase().collection(AUDIT_TRAIL_COLLECTION).find({ entityId: project._id, action: 'budget.adjusted' }).toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0].summary).toContain(response.body.data.folio);
    expect(entries[0].summary).not.toMatch(/250/);
  });

  it('valida monto y motivo', async () => {
    const project = await createProject({ name: 'Validación' });
    for (const body of [
      { amount: '100', reason: 'Sin decimales' },
      { amount: '100.5', reason: 'Un decimal' },
      { amount: '0.00', reason: 'Cero' },
      { amount: 100.5, reason: 'Número' },
      { amount: '100.00' },
      { amount: '100.00', reason: '  ' },
    ]) {
      const response = await adjust(project._id, body);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('un user recibe 403 al registrar un ajuste y al leer el historial', async () => {
    const project = await createProject({ name: 'Permisos' });
    expect((await adjust(project._id, { amount: '100.00', reason: 'No debería' }, tokens.userA)).status).toBe(403);
    expect((await api(tokens.userA).get(movementsPath(project._id))).status).toBe(403);
    expect((await api(tokens.adminA).get(movementsPath(project._id))).body.data.total).toBe(1);
  });

  it('otro tenant recibe 404', async () => {
    const project = await createProject({ name: 'Tenant A' });
    expect((await adjust(project._id, { amount: '100.00', reason: 'Otro tenant' }, tokens.adminB)).status).toBe(404);
    expect((await api(tokens.adminB).get(movementsPath(project._id))).status).toBe(404);
  });
});

describe('corregir un movimiento', () => {
  it('registra el monto contrario con la referencia y deja el presupuesto como estaba', async () => {
    const project = await createProject({ name: 'Corrección' });
    const original = await adjustment(project._id, '300.00');

    const response = await adjust(project._id, { amount: '-300.00', reason: 'Captura duplicada', reversesMovementId: original.id });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ kind: 'adjustment', amount: '-300.00', reversesMovementId: original.id });
    expect((await budgetOf(project._id)).currentBudget).toBe('1000000.00');

    const { items } = (await api(tokens.adminA).get(movementsPath(project._id))).body.data;
    expect(items.find((item: Movement) => item.id === original.id).reversed).toBe(true);
    expect(items).toHaveLength(3);
  });

  it('revertir dos veces el mismo movimiento devuelve 409 ALREADY_REVERSED', async () => {
    const project = await createProject({ name: 'Doble corrección' });
    const original = await adjustment(project._id, '300.00');
    const reversal = { amount: '-300.00', reason: 'Corrección', reversesMovementId: original.id };
    expect((await adjust(project._id, reversal)).status).toBe(201);

    const second = await adjust(project._id, reversal);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ALREADY_REVERSED');
    expect((await budgetOf(project._id)).currentBudget).toBe('1000000.00');
  });

  it('dos correcciones simultáneas del mismo movimiento: solo entra una', async () => {
    const project = await createProject({ name: 'Corrección concurrente' });
    const original = await adjustment(project._id, '300.00');
    const reversal = { amount: '-300.00', reason: 'Corrección', reversesMovementId: original.id };

    const responses = await Promise.all([1, 2, 3, 4].map(() => adjust(project._id, reversal)));
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409, 409, 409]);
    expect((await budgetOf(project._id)).currentBudget).toBe('1000000.00');
  });

  it('exige el monto contrario, un ajuste y un movimiento de la misma obra', async () => {
    const project = await createProject({ name: 'Reglas de corrección' });
    const other = await createProject({ name: 'Otra obra' });
    const original = await adjustment(project._id, '300.00');
    const initial = (await api(tokens.adminA).get(movementsPath(project._id))).body.data.items.find((item: Movement) => item.kind === 'initial_budget');

    const mismatch = await adjust(project._id, { amount: '-299.99', reason: 'Monto distinto', reversesMovementId: original.id });
    expect([mismatch.status, mismatch.body.error.code]).toEqual([409, 'REVERSAL_AMOUNT_MISMATCH']);
    const notAdjustment = await adjust(project._id, { amount: '-1000000.00', reason: 'Inicial', reversesMovementId: initial.id });
    expect([notAdjustment.status, notAdjustment.body.error.code]).toEqual([409, 'MOVEMENT_NOT_REVERSIBLE']);
    const otherProject = await adjust(other._id, { amount: '-300.00', reason: 'Otra obra', reversesMovementId: original.id });
    expect([otherProject.status, otherProject.body.error.code]).toEqual([404, 'MOVEMENT_NOT_FOUND']);
    expect((await budgetOf(project._id)).currentBudget).toBe('1000300.00');
  });
});

describe('folios', () => {
  it('diez ajustes en paralelo producen folios MOV únicos y consecutivos', async () => {
    const project = await createProject({ name: 'Folios en paralelo' });
    const last = (await adjustment(project._id, '1.00')).folio;
    const start = Number(last.split('-')[1]);

    const responses = await Promise.all(Array.from({ length: 10 }, (_, index) => adjust(project._id, { amount: `${index + 1}.00`, reason: `Ajuste ${index + 1}` })));
    expect(responses.map((response) => response.status)).toEqual(Array(10).fill(201));

    const folios = responses.map((response) => response.body.data.folio as string).sort();
    expect(new Set(folios).size).toBe(10);
    expect(folios).toEqual(Array.from({ length: 10 }, (_, index) => `MOV-${String(start + index + 1).padStart(6, '0')}`));
    // 1 + (1 + 2 + … + 10) sobre el presupuesto inicial: no se perdió ninguno.
    expect((await budgetOf(project._id)).currentBudget).toBe('1000056.00');
  }, 60_000);
});
