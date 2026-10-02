import type { z } from 'zod';
import { Decimal128, MongoServerError } from 'mongodb';
import type { BudgetMovement, CreateBudgetMovementRequest, PageQuerySchema, Paginated } from '@erp/domain';
import { withTransaction } from '../../../config/database';
import type { AuditTrailRepository } from '../../../core/audit';
import type { CountersRepository } from '../../../core/counters';
import { Decimal, moneyToString } from '../../../core/decimal';
import { HttpError } from '../../../core/http-error';
import type { RequestUser } from '../../../core/middlewares/auth';
import type { RealtimePublisher } from '../../../core/realtime';
import type { ProjectsRepository } from '../projects/projects.repository';
import { projectNotFound } from '../projects/projects.service';
import type { BudgetMovementDocument, BudgetMovementsRepository } from './budget.repository';

export const BUDGET_MOVEMENT_SERIES = 'MOV';

const alreadyReversed = () => new HttpError(409, 'ALREADY_REVERSED', 'Este movimiento ya fue corregido');

export function toBudgetMovement(movement: BudgetMovementDocument, reversed: boolean): BudgetMovement {
  return {
    id: movement._id,
    folio: movement.folio,
    projectId: movement.projectId,
    kind: movement.kind,
    amount: moneyToString(movement.amount),
    reason: movement.reason,
    reversesMovementId: movement.reversesMovementId,
    reversed,
    createdBy: movement.createdBy,
    createdAt: movement.createdAt.toISOString(),
  };
}

export interface BudgetDependencies {
  budget: BudgetMovementsRepository;
  projects: ProjectsRepository;
  counters: CountersRepository;
  audit: AuditTrailRepository;
  publish: RealtimePublisher;
}

/** Las rutas de este servicio exigen `construction.budget:read_amounts` o `:adjust`: sus respuestas siempre llevan montos. */
export class BudgetService {
  public constructor(private readonly deps: BudgetDependencies) {}

  async list(projectId: string, query: z.output<typeof PageQuerySchema>, actor: RequestUser): Promise<Paginated<BudgetMovement>> {
    if (!(await this.deps.projects.findById(projectId, actor.tenantId))) throw projectNotFound();
    const page = await this.deps.budget.findPage(actor.tenantId, projectId, query);
    const reversed = await this.deps.budget.findReversedIds(actor.tenantId, page.items.map((movement) => movement._id));
    return { ...page, items: page.items.map((movement) => toBudgetMovement(movement, reversed.has(movement._id))) };
  }

  /**
   * Registra un ajuste (aumento o reducción). Con `reversesMovementId` es la corrección de otro ajuste:
   * los movimientos no se editan ni se borran, se compensan con uno de monto contrario.
   */
  async adjust(projectId: string, input: CreateBudgetMovementRequest, actor: RequestUser): Promise<BudgetMovement> {
    const { tenantId } = actor;
    const reversesMovementId = input.reversesMovementId ?? null;
    let movement: BudgetMovementDocument;
    try {
      movement = await withTransaction(async (session) => {
        // Candado de la obra: evita que se elimine mientras se le registra un movimiento.
        if (!(await this.deps.projects.touch(projectId, tenantId, session))) throw projectNotFound();

        let summary = input.amount.startsWith('-') ? 'una reducción' : 'un aumento';
        if (reversesMovementId) {
          const original = await this.deps.budget.findById(tenantId, reversesMovementId, session);
          if (!original || original.projectId !== projectId) throw new HttpError(404, 'MOVEMENT_NOT_FOUND', 'El movimiento a corregir no existe en esta obra');
          if (original.kind !== 'adjustment') throw new HttpError(409, 'MOVEMENT_NOT_REVERSIBLE', 'Solo se pueden corregir los ajustes');
          if (!Decimal.from(original.amount).neg().eq(Decimal.parse(input.amount))) {
            throw new HttpError(409, 'REVERSAL_AMOUNT_MISMATCH', 'La corrección debe llevar el monto contrario al del movimiento original');
          }
          if (await this.deps.budget.findReversalOf(tenantId, reversesMovementId, session)) throw alreadyReversed();
          summary = `la corrección de ${original.folio}`;
        }

        const folio = await this.deps.counters.next(tenantId, BUDGET_MOVEMENT_SERIES, session);
        const created = await this.deps.budget.insert({
          tenantId, folio, projectId, kind: 'adjustment', amount: Decimal128.fromString(input.amount),
          reason: input.reason, reversesMovementId, createdBy: actor.id,
        }, session);
        await this.deps.audit.record({
          tenantId, actorId: actor.id, action: reversesMovementId ? 'budget.reversed' : 'budget.adjusted',
          entityType: 'project', entityId: projectId, summary: `Registró ${summary} de presupuesto (${folio})`,
        }, session);
        return created;
      });
    } catch (error) {
      // Dos correcciones simultáneas del mismo movimiento: la segunda choca con el índice único.
      if (error instanceof MongoServerError && error.code === 11000 && reversesMovementId) throw alreadyReversed();
      throw error;
    }
    this.deps.publish(tenantId, { type: 'construction.changed', entity: 'project', id: projectId });
    return toBudgetMovement(movement, false);
  }
}
