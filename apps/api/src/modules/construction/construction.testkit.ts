import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { toISODate } from '@erp/domain';
import { getDatabase, withTransaction } from '../../config/database';
import { createUserAndLogin, startDatabase } from '../../test/helpers';
import { constructionRepositories } from './construction.container';
import { insertProject, insertProposal, type ProjectFixture, type ProposalFixture } from './construction.fixtures';
import type { ProjectDocument } from './projects/projects.repository';
import type { ProposalDocument } from './proposals/proposals.repository';

// Utilidades compartidas por las pruebas del módulo (no es un archivo de pruebas: no termina en `.test.ts`).

export const tokens = { adminA: '', userA: '', adminB: '' };
const FIXTURE_ACTOR = 'fixture-actor';

/** Base en memoria con réplica (las transacciones lo exigen) y un admin y un user en el tenant A, más un admin en el B. */
export async function startConstruction(): Promise<MongoMemoryReplSet> {
  const replSet = await startDatabase();
  tokens.adminA = await createUserAndLogin('admin-a@example.com', 'admin', 'tenant-a');
  tokens.userA = await createUserAndLogin('user-a@example.com', 'user', 'tenant-a');
  tokens.adminB = await createUserAndLogin('admin-b@example.com', 'admin', 'tenant-b');
  return replSet;
}

/** Fecha `AAAA-MM-DD` a `days` días de hoy (UTC). */
export function dayFromNow(days: number): string {
  return toISODate(new Date(Date.now() + days * 24 * 60 * 60 * 1000));
}

export async function createProposal(overrides: Partial<ProposalFixture> = {}, tenantId = 'tenant-a'): Promise<ProposalDocument> {
  const fixture: ProposalFixture = {
    name: 'Bodega Norte',
    client: 'Logística MTY',
    location: 'Monterrey',
    type: 'industrial',
    scope: 'Nave industrial con andenes de carga',
    materials: [{ name: 'Estructura metálica', origin: 'Monterrey, N.L.', supplier: 'Grupo Collado' }],
    estimatedStart: dayFromNow(30),
    estimatedEnd: dayFromNow(300),
    estimatedBudget: '31400000.00',
    certification: 'LEED',
    level: 'Silver',
    targets: { co2TonsPerYear: 210, energySavingPct: 25, waterM3PerYear: 4200 },
    status: 'in_review',
    ...overrides,
  };
  return withTransaction((session) => insertProposal(constructionRepositories(getDatabase()), tenantId, FIXTURE_ACTOR, fixture, session));
}

export async function createProject(overrides: Partial<ProjectFixture> = {}, tenantId = 'tenant-a'): Promise<ProjectDocument> {
  const fixture: ProjectFixture = {
    name: 'Torre Cedro',
    client: 'Inversiones Bosque',
    location: 'Querétaro',
    type: 'commercial',
    status: 'in_progress',
    progressPct: 40,
    phases: [
      { key: 'foundation', name: 'Cimentación', plannedStart: dayFromNow(-200), plannedEnd: dayFromNow(-90), status: 'completed' },
      { key: 'structure', name: 'Estructura', plannedStart: dayFromNow(-90), plannedEnd: dayFromNow(60), status: 'in_progress' },
    ],
    certification: 'EDGE',
    level: 'EDGE Advanced',
    impact: { co2TonsPerYear: 150, energySavingPct: 20, waterM3PerYear: 1500 },
    initialBudget: '1000000.00',
    ...overrides,
  };
  return withTransaction((session) => insertProject(constructionRepositories(getDatabase()), tenantId, FIXTURE_ACTOR, fixture, session));
}

const MONEY_KEYS = new Set(['estimatedBudget', 'currentBudget', 'spent', 'available', 'amount', 'initialBudget']);
const MONEY_VALUE = /^-?\d+\.\d{2}$/;

/**
 * Rutas (p. ej. `budget.currentBudget`) de todo lo que parezca dinero en un JSON: claves de monto o strings con
 * forma de monto. Se revisa el JSON real de la respuesta, no los tipos.
 */
export function moneyFields(value: unknown, path = ''): string[] {
  if (typeof value === 'string') return MONEY_VALUE.test(value) ? [path] : [];
  if (Array.isArray(value)) return value.flatMap((item, index) => moneyFields(item, `${path}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => {
      const child = path ? `${path}.${key}` : key;
      return MONEY_KEYS.has(key) ? [child] : moneyFields(item, child);
    });
  }
  return [];
}
