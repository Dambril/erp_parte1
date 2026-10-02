import type { Db } from 'mongodb';
import { toISODate, type PhaseStatus, type ProjectPhase } from '@erp/domain';
import { withTransaction } from '../config/database';
import { constructionRepositories } from '../modules/construction/construction.container';
import {
  insertProject, insertProposal, type ProjectFixture, type ProposalFixture,
} from '../modules/construction/construction.fixtures';

// Datos de demostración del módulo de construcción. Las fechas son relativas al día en que se carga,
// para que Torre Cedro siempre aparezca retrasada.

const DAY_MS = 24 * 60 * 60 * 1000;
const day = (offset: number) => toISODate(new Date(Date.now() + offset * DAY_MS));
const phase = (key: string, name: string, start: number, end: number, status: PhaseStatus): ProjectPhase =>
  ({ key, name, plannedStart: day(start), plannedEnd: day(end), status });

const PROJECTS: ProjectFixture[] = [
  {
    // Retrasada: su fase en curso debió terminar hace 10 días.
    name: 'Torre Cedro', client: 'Inversiones Bosque', location: 'Querétaro', type: 'commercial',
    status: 'in_progress', progressPct: 45, certification: 'none', level: null,
    phases: [
      phase('permits', 'Permisos', -300, -210, 'completed'),
      phase('foundation', 'Cimentación', -210, -90, 'completed'),
      phase('structure', 'Estructura', -90, -10, 'in_progress'),
      phase('facade', 'Fachada', 60, 260, 'pending'),
    ],
    impact: { co2TonsPerYear: 150, energySavingPct: 15, waterM3PerYear: 1500 },
    initialBudget: '95000000.00',
    movements: [{ kind: 'expense', amount: '41300000.00', reason: 'Estimaciones pagadas a la fecha' }],
  },
  {
    // 96% del presupuesto ejercido: 17,472,000.00 de 18,200,000.00.
    name: 'Plaza Origen', client: 'Municipio Tlaxcala', location: 'Tlaxcala', type: 'public',
    status: 'in_progress', progressPct: 68, certification: 'EDGE', level: 'EDGE Certified',
    requirements: { 'EDGE-WATER': 'in_review' },
    phases: [
      phase('earthworks', 'Terracerías', -200, -120, 'completed'),
      phase('structure', 'Estructura', -120, 40, 'in_progress'),
      phase('roof', 'Cubierta y locales', 30, 180, 'pending'),
    ],
    impact: { co2TonsPerYear: 95, energySavingPct: 20, waterM3PerYear: 3100 },
    initialBudget: '17000000.00',
    movements: [
      { kind: 'adjustment', amount: '1200000.00', reason: 'Ampliación del área verde central' },
      { kind: 'expense', amount: '17472000.00', reason: 'Estimaciones pagadas a la fecha' },
    ],
  },
  {
    // Certificando, con requisitos todavía pendientes.
    name: 'Oficinas Raíz', client: 'Constructora Sur', location: 'CDMX', type: 'commercial',
    status: 'certifying', progressPct: 100, certification: 'LEED', level: 'Gold',
    requirements: { 'LEED-LT': 'met', 'LEED-SS': 'met', 'LEED-WE': 'in_review', 'LEED-MR': 'met' },
    phases: [
      phase('foundation', 'Cimentación', -700, -560, 'completed'),
      phase('structure', 'Estructura', -560, -300, 'completed'),
      phase('facade', 'Fachada e instalaciones', -300, -60, 'completed'),
      phase('commissioning', 'Comisionamiento', -60, -5, 'completed'),
    ],
    impact: { co2TonsPerYear: 520, energySavingPct: 32, waterM3PerYear: 5200 },
    initialBudget: '68000000.00',
    movements: [{ kind: 'expense', amount: '66100000.00', reason: 'Estimaciones pagadas a la fecha' }],
  },
  {
    name: 'Residencial Alameda', client: 'Grupo Vértice', location: 'Puebla', type: 'residential',
    status: 'in_progress', progressPct: 56, certification: 'EDGE', level: 'EDGE Advanced',
    requirements: { 'EDGE-MATERIALS': 'met' },
    phases: [
      phase('foundation', 'Cimentación', -270, -150, 'completed'),
      phase('structure', 'Estructura', -150, 20, 'in_progress'),
      phase('installations', 'Instalaciones', -40, 120, 'pending'),
      phase('finishes', 'Acabados', 90, 300, 'pending'),
    ],
    impact: { co2TonsPerYear: 310, energySavingPct: 40, waterM3PerYear: 2400 },
    initialBudget: '42500000.00',
    movements: [
      { kind: 'adjustment', amount: '850000.00', reason: 'Ampliación de estacionamiento' },
      { kind: 'adjustment', amount: '-850000.00', reason: 'La ampliación se capturó por error en esta obra', reverses: 0 },
      { kind: 'expense', amount: '24650000.00', reason: 'Estimaciones pagadas a la fecha' },
    ],
  },
  {
    name: 'Casa Manantial', client: 'Familia Ríos', location: 'Cuernavaca', type: 'residential',
    status: 'completed', progressPct: 100, certification: 'none', level: null,
    phases: [
      phase('shell', 'Obra negra', -420, -250, 'completed'),
      phase('grey', 'Obra gris', -250, -150, 'completed'),
      phase('finishes', 'Acabados', -150, -60, 'completed'),
    ],
    impact: { co2TonsPerYear: 18, energySavingPct: 25, waterM3PerYear: 650 },
    initialBudget: '6100000.00',
    movements: [{ kind: 'expense', amount: '5980000.00', reason: 'Estimaciones pagadas a la fecha' }],
  },
];

const PROPOSALS: ProposalFixture[] = [
  {
    name: 'Bodega Norte', client: 'Logística MTY', location: 'Monterrey', type: 'industrial', status: 'in_review',
    scope: 'Nave industrial de 8,500 m² con andenes de carga y oficinas administrativas.',
    materials: [
      { name: 'Estructura metálica prefabricada', origin: 'Monterrey, N.L.', supplier: 'Grupo Collado' },
      { name: 'Losa de concreto reforzado', origin: 'Monterrey, N.L.', supplier: 'Cemex' },
      { name: 'Panel aislante', origin: 'San Nicolás, N.L.', supplier: 'Ternium Multytecho' },
    ],
    estimatedStart: day(20), estimatedEnd: day(330), estimatedBudget: '31400000.00',
    certification: 'LEED', level: 'Silver',
    targets: { co2TonsPerYear: 210, energySavingPct: 25, waterM3PerYear: 4200 },
  },
  {
    // Propuesta ficticia de demostración.
    name: 'Centro Comunitario Ahuehuete', client: 'Municipio de Cholula', location: 'Puebla', type: 'public', status: 'in_review',
    scope: 'Centro comunitario de 1,900 m² con biblioteca, salones de usos múltiples y huerto urbano.',
    materials: [
      { name: 'Block de tierra comprimida', origin: 'Cholula, Pue.', supplier: 'Tierra Viva' },
      { name: 'Madera laminada certificada', origin: 'Durango, Dgo.', supplier: 'Maderas Durango' },
    ],
    estimatedStart: day(45), estimatedEnd: day(280), estimatedBudget: '12800000.00',
    certification: 'EDGE', level: 'EDGE Certified',
    targets: { co2TonsPerYear: 60, energySavingPct: 22, waterM3PerYear: 900 },
  },
];

/**
 * Carga las obras y propuestas de demostración si el tenant aún no tiene ninguna. Va en una sola transacción:
 * o queda todo (con sus folios, movimientos y bitácora) o no queda nada.
 */
export async function seedConstruction(db: Db, tenantId: string, actorId: string): Promise<boolean> {
  const repositories = constructionRepositories(db);
  if ((await repositories.projects.count(tenantId)) > 0 || (await repositories.proposals.count(tenantId)) > 0) return false;

  await withTransaction(async (session) => {
    for (const project of PROJECTS) await insertProject(repositories, tenantId, actorId, project, session);
    for (const proposal of PROPOSALS) await insertProposal(repositories, tenantId, actorId, proposal, session);
  });
  return true;
}

export const SEED_CONSTRUCTION_SUMMARY = `${PROJECTS.length} obras y ${PROPOSALS.length} propuestas en revisión`;
