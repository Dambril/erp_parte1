import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { TrashItem } from '@erp/domain';
import { AUDIT_TRAIL_COLLECTION } from '../../../core/audit';
import { getDatabase } from '../../../config/database';
import { api, stopDatabase } from '../../../test/helpers';
import { createProject, createProposal, moneyFields, startConstruction, tokens } from '../construction.testkit';

let replSet: MongoMemoryReplSet;

const trash = async (token: string, query = '') =>
  (await api(token).get(`/construction/trash${query}`)).body.data as { items: TrashItem[]; total: number; page: number; pageSize: number };
const projectNames = async (token: string) =>
  ((await api(token).get('/construction/projects?pageSize=100')).body.data.items as { name: string }[]).map((item) => item.name);

beforeAll(async () => {
  replSet = await startConstruction();
}, 120_000);

afterAll(async () => {
  await stopDatabase(replSet);
});

describe('papelera', () => {
  it('lista obras y propuestas eliminadas con fecha y quién las eliminó, sin montos', async () => {
    const project = await createProject({ name: 'Obra en papelera' });
    const proposal = await createProposal({ name: 'Propuesta en papelera', status: 'draft' });
    await createProject({ name: 'Obra viva' });
    expect((await api(tokens.adminA).delete(`/construction/projects/${project._id}`)).status).toBe(204);
    expect((await api(tokens.adminA).delete(`/construction/proposals/${proposal._id}`)).status).toBe(204);

    const page = await trash(tokens.adminA);
    expect(page).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    // Lo eliminado más reciente va primero.
    expect(page.items).toEqual([
      {
        id: proposal._id, kind: 'proposal', folio: proposal.folio, name: 'Propuesta en papelera',
        deletedAt: expect.any(String), deletedBy: { id: expect.any(String), name: 'admin-a@example.com' },
      },
      {
        id: project._id, kind: 'project', folio: project.folio, name: 'Obra en papelera',
        deletedAt: expect.any(String), deletedBy: { id: expect.any(String), name: 'admin-a@example.com' },
      },
    ]);
    expect(moneyFields(page)).toEqual([]);

    const first = await trash(tokens.adminA, '?pageSize=1');
    expect(first.items.map((item) => item.id)).toEqual([proposal._id]);
    expect((await trash(tokens.adminA, '?pageSize=1&page=2')).items.map((item) => item.id)).toEqual([project._id]);
  });

  it('solo muestra elementos del propio tenant y otro tenant no los restaura', async () => {
    const mine = await createProject({ name: 'Eliminada del tenant B' }, 'tenant-b');
    await api(tokens.adminB).delete(`/construction/projects/${mine._id}`);

    expect((await trash(tokens.adminB)).items.map((item) => item.name)).toEqual(['Eliminada del tenant B']);
    expect((await trash(tokens.adminA)).items.map((item) => item.name)).not.toContain('Eliminada del tenant B');
    expect((await api(tokens.adminA).post(`/construction/projects/${mine._id}/restore`)).status).toBe(404);
    expect((await trash(tokens.adminB)).total).toBe(1);
  });

  it('un user recibe 403 en la papelera y al restaurar', async () => {
    const project = await createProject({ name: 'Sin permiso de restaurar' });
    await api(tokens.adminA).delete(`/construction/projects/${project._id}`);

    const list = await api(tokens.userA).get('/construction/trash');
    expect(list.status).toBe(403);
    expect(list.body.error.code).toBe('FORBIDDEN');
    expect((await api(tokens.userA).post(`/construction/projects/${project._id}/restore`)).status).toBe(403);
    expect((await api('').get('/construction/trash')).status).toBe(401);
  });

  it('restaurar devuelve la obra al listado con su presupuesto y lo registra en la bitácora', async () => {
    const project = await createProject({ name: 'Obra que vuelve', initialBudget: '2500000.00' });
    const path = `/construction/projects/${project._id}`;
    await api(tokens.adminA).delete(path);
    expect(await projectNames(tokens.adminA)).not.toContain('Obra que vuelve');
    expect((await api(tokens.adminA).get(path)).status).toBe(404);

    const restored = await api(tokens.adminA).post(`${path}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body.data).toMatchObject({ id: project._id, name: 'Obra que vuelve', budget: { currentBudget: '2500000.00' } });
    expect(await projectNames(tokens.adminA)).toContain('Obra que vuelve');
    expect((await trash(tokens.adminA)).items.map((item) => item.id)).not.toContain(project._id);

    // Una obra que no está eliminada no se restaura.
    expect((await api(tokens.adminA).post(`${path}/restore`)).status).toBe(404);
    const actions = (await getDatabase().collection(AUDIT_TRAIL_COLLECTION).find({ entityId: project._id }).sort({ at: 1 }).toArray())
      .map((entry) => entry.action);
    expect(actions).toEqual(['project.created', 'project.deleted', 'project.restored']);
    const activity = (await api(tokens.adminA).get(`${path}/activity`)).body.data.items as { summary: string }[];
    expect(activity[0].summary).toBe('Restauró la obra desde la Papelera');
  });

  it('una obra archivada y luego eliminada vuelve a Archivadas, no al listado activo', async () => {
    const project = await createProject({ name: 'Archivada y eliminada' });
    const path = `/construction/projects/${project._id}`;
    await api(tokens.adminA).post(`${path}/archive`);
    await api(tokens.adminA).delete(path);
    expect((await api(tokens.adminA).post(`${path}/restore`)).body.data.archivedAt).toEqual(expect.any(String));
    expect(await projectNames(tokens.adminA)).not.toContain('Archivada y eliminada');
  });
});
