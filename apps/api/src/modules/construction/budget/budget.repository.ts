import { randomUUID } from 'node:crypto';
import { Decimal128, type ClientSession, type Collection, type Db } from 'mongodb';
import type { BudgetMovementKind } from '@erp/domain';
import type { Page, PageRequest } from '../../../core/repository';
import { PROJECTS_COLLECTION } from '../projects/projects.repository';

export const BUDGET_MOVEMENTS_COLLECTION = 'budgetMovements';

/** Fuente de verdad del presupuesto de una obra. Inmutable: no tiene `updatedAt` ni `deletedAt`. */
export interface BudgetMovementDocument {
  _id: string;
  tenantId: string;
  folio: string;
  projectId: string;
  kind: BudgetMovementKind;
  /** `initial_budget` y `expense` en positivo; `adjustment` con signo. */
  amount: Decimal128;
  reason: string;
  reversesMovementId: string | null;
  createdBy: string;
  createdAt: Date;
  custom: Record<string, unknown>;
}
export type NewBudgetMovement = Omit<BudgetMovementDocument, '_id' | 'createdAt' | 'custom'>;

export interface BudgetTotals {
  /** Presupuesto inicial más ajustes. */
  currentBudget: Decimal128;
  spent: Decimal128;
  available: Decimal128;
  spentPct: number;
  /** Movimientos distintos del presupuesto inicial. */
  otherMovements: number;
}

export interface ProjectBudgetRow {
  projectId: string;
  folio: string;
  name: string;
  spentPct: number;
}

const ZERO = Decimal128.fromString('0');
const BUDGET_KINDS: BudgetMovementKind[] = ['initial_budget', 'adjustment'];

/** Suma por obra, con aritmética Decimal128 del servidor: ningún monto pasa por `number`. */
const TOTALS = {
  currentBudget: { $sum: { $cond: [{ $in: ['$kind', BUDGET_KINDS] }, '$amount', ZERO] } },
  spent: { $sum: { $cond: [{ $eq: ['$kind', 'expense'] }, '$amount', ZERO] } },
};

/** Porcentaje entero gastado; el resultado es un porcentaje, no dinero, y sale como entero. */
const SPENT_PCT = {
  $cond: [
    { $gt: ['$currentBudget', ZERO] },
    { $toInt: { $round: [{ $multiply: [{ $divide: ['$spent', '$currentBudget'] }, 100] }, 0] } },
    0,
  ],
};

/** Deja solo los totales de obras vivas (ni eliminadas ni archivadas) del tenant. */
const liveProjects = (tenantId: string) => [
  { $lookup: { from: PROJECTS_COLLECTION, localField: '_id', foreignField: '_id', as: 'project' } },
  { $unwind: '$project' },
  { $match: { 'project.tenantId': tenantId, 'project.deletedAt': null, 'project.archivedAt': null } },
];

/** Solo inserta, lista y agrega. A propósito no existe ningún método para modificar ni borrar un movimiento. */
export class BudgetMovementsRepository {
  public constructor(private readonly collection: Collection<BudgetMovementDocument>) {}

  private static requireTenant(tenantId: string): string {
    if (!tenantId) throw new Error('tenantId is required for repository queries');
    return tenantId;
  }

  async insert(movement: NewBudgetMovement, session: ClientSession): Promise<BudgetMovementDocument> {
    BudgetMovementsRepository.requireTenant(movement.tenantId);
    const document: BudgetMovementDocument = { ...movement, _id: randomUUID(), createdAt: new Date(), custom: {} };
    await this.collection.insertOne(document, { session });
    return document;
  }

  async findById(tenantId: string, id: string, session?: ClientSession): Promise<BudgetMovementDocument | null> {
    return this.collection.findOne({ tenantId: BudgetMovementsRepository.requireTenant(tenantId), _id: id }, { session });
  }

  async findReversalOf(tenantId: string, movementId: string, session?: ClientSession): Promise<BudgetMovementDocument | null> {
    return this.collection.findOne(
      { tenantId: BudgetMovementsRepository.requireTenant(tenantId), reversesMovementId: movementId }, { session },
    );
  }

  /** De los movimientos indicados, los que ya tienen una corrección registrada. */
  async findReversedIds(tenantId: string, movementIds: string[]): Promise<Set<string>> {
    const reversals = await this.collection
      .find({ tenantId: BudgetMovementsRepository.requireTenant(tenantId), reversesMovementId: { $in: movementIds } })
      .project<{ reversesMovementId: string }>({ reversesMovementId: 1 }).toArray();
    return new Set(reversals.map((reversal) => reversal.reversesMovementId));
  }

  /** Historial de una obra, del más reciente al más antiguo (el folio se asigna en la transacción: es el orden de commit). */
  async findPage(tenantId: string, projectId: string, { page, pageSize }: PageRequest): Promise<Page<BudgetMovementDocument>> {
    const query = { tenantId: BudgetMovementsRepository.requireTenant(tenantId), projectId };
    const [items, total] = await Promise.all([
      this.collection.find(query).sort({ folio: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
      this.collection.countDocuments(query),
    ]);
    return { items, page, pageSize, total };
  }

  /** Presupuesto de una obra derivado de sus movimientos. */
  async totals(tenantId: string, projectId: string, session?: ClientSession): Promise<BudgetTotals> {
    const [row] = await this.collection.aggregate<BudgetTotals>([
      { $match: { tenantId: BudgetMovementsRepository.requireTenant(tenantId), projectId } },
      { $group: { _id: null, ...TOTALS, otherMovements: { $sum: { $cond: [{ $ne: ['$kind', 'initial_budget'] }, 1, 0] } } } },
      { $addFields: { available: { $subtract: ['$currentBudget', '$spent'] }, spentPct: SPENT_PCT } },
    ], { session }).toArray();
    return row ?? { currentBudget: ZERO, spent: ZERO, available: ZERO, spentPct: 0, otherMovements: 0 };
  }

  /** Porcentaje gastado del conjunto de obras vivas del tenant. */
  async portfolioSpentPct(tenantId: string): Promise<number> {
    const [row] = await this.collection.aggregate<{ spentPct: number }>([
      { $match: { tenantId: BudgetMovementsRepository.requireTenant(tenantId) } },
      { $group: { _id: '$projectId', ...TOTALS } },
      ...liveProjects(tenantId),
      { $group: { _id: null, currentBudget: { $sum: '$currentBudget' }, spent: { $sum: '$spent' } } },
      { $project: { _id: 0, spentPct: SPENT_PCT } },
    ]).toArray();
    return row?.spentPct ?? 0;
  }

  /** Obras vivas y sin terminar que ya gastaron `minPct` o más de su presupuesto. */
  async findNearLimit(tenantId: string, minPct: number, limit: number): Promise<ProjectBudgetRow[]> {
    return this.collection.aggregate<ProjectBudgetRow>([
      { $match: { tenantId: BudgetMovementsRepository.requireTenant(tenantId) } },
      { $group: { _id: '$projectId', ...TOTALS } },
      { $addFields: { spentPct: SPENT_PCT } },
      { $match: { spentPct: { $gte: minPct } } },
      ...liveProjects(tenantId),
      { $match: { 'project.status': { $ne: 'completed' } } },
      { $sort: { spentPct: -1, 'project.folio': 1 } },
      { $limit: limit },
      { $project: { _id: 0, projectId: '$_id', folio: '$project.folio', name: '$project.name', spentPct: 1 } },
    ]).toArray();
  }
}

export function budgetMovementsRepository(db: Db): BudgetMovementsRepository {
  return new BudgetMovementsRepository(db.collection<BudgetMovementDocument>(BUDGET_MOVEMENTS_COLLECTION));
}

export async function ensureBudgetIndexes(db: Db): Promise<void> {
  await db.collection(BUDGET_MOVEMENTS_COLLECTION).createIndexes([
    { key: { tenantId: 1, projectId: 1, createdAt: 1 }, name: 'tenant_project_created' },
    { key: { tenantId: 1, folio: 1 }, name: 'tenant_folio_unique', unique: true },
    // Un movimiento solo puede revertirse una vez: lo garantiza la base, no solo el servicio.
    {
      key: { tenantId: 1, reversesMovementId: 1 },
      name: 'tenant_reverses_movement_unique',
      unique: true,
      partialFilterExpression: { reversesMovementId: { $type: 'string' } },
    },
  ]);
}
