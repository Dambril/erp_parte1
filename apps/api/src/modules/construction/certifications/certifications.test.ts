import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { AUDIT_TRAIL_COLLECTION } from '../../../core/audit';
import { getDatabase } from '../../../config/database';
import { api, stopDatabase } from '../../../test/helpers';
import { createProject, startConstruction, tokens } from '../construction.testkit';

let replSet: MongoMemoryReplSet;

const requirementPath = (projectId: string, code: string) => `/construction/projects/${projectId}/certification/requirements/${code}`;

beforeAll(async () => {
  replSet = await startConstruction();
}, 120_000);

afterAll(async () => {
  await stopDatabase(replSet);
});

describe('requisitos de certificación', () => {
  it('actualiza estado y nota de un requisito, con quién y cuándo, y lo registra en la bitácora', async () => {
    const project = await createProject({ name: 'Oficinas Raíz', status: 'certifying', certification: 'LEED', level: 'Gold' });

    const response = await api(tokens.adminA).patch(requirementPath(project._id, 'LEED-WE'), { status: 'met', note: 'Reporte de consumo entregado' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ code: 'LEED-WE', title: 'Eficiencia en agua', status: 'met', note: 'Reporte de consumo entregado' });
    expect(response.body.data.updatedBy).toEqual(expect.any(String));
    expect(response.body.data.updatedAt).toEqual(expect.any(String));

    const { requirements } = (await api(tokens.userA).get(`/construction/projects/${project._id}`)).body.data;
    expect(requirements.filter((requirement: { status: string }) => requirement.status === 'met').map((requirement: { code: string }) => requirement.code)).toEqual(['LEED-WE']);
    expect(requirements).toHaveLength(6);

    const [entry] = await getDatabase().collection(AUDIT_TRAIL_COLLECTION)
      .find({ entityId: project._id, action: 'certification.requirement_updated' }).toArray();
    expect(entry).toMatchObject({ tenantId: 'tenant-a', entityType: 'project' });
    expect(entry.summary).toContain('Eficiencia en agua');
  });

  it('un user recibe 403 y el requisito no cambia', async () => {
    const project = await createProject({ name: 'Permisos' });
    const response = await api(tokens.userA).patch(requirementPath(project._id, 'EDGE-WATER'), { status: 'met', note: '' });

    expect(response.status).toBe(403);
    const { requirements } = (await api(tokens.adminA).get(`/construction/projects/${project._id}`)).body.data;
    expect(requirements.every((requirement: { status: string }) => requirement.status === 'pending')).toBe(true);
  });

  it('valida el estado y responde 404 si la obra o el requisito no existen', async () => {
    const project = await createProject({ name: 'Validación' });

    const invalid = await api(tokens.adminA).patch(requirementPath(project._id, 'EDGE-WATER'), { status: 'done' });
    expect([invalid.status, invalid.body.error.code]).toEqual([400, 'VALIDATION_ERROR']);
    const unknown = await api(tokens.adminA).patch(requirementPath(project._id, 'LEED-WE'), { status: 'met' });
    expect([unknown.status, unknown.body.error.code]).toEqual([404, 'REQUIREMENT_NOT_FOUND']);
    const otherTenant = await api(tokens.adminB).patch(requirementPath(project._id, 'EDGE-WATER'), { status: 'met' });
    expect([otherTenant.status, otherTenant.body.error.code]).toEqual([404, 'PROJECT_NOT_FOUND']);
  });
});
