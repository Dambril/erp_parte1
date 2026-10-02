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
