import type { z } from 'zod';
import {
  CERTIFICATION_REQUIREMENT_TEMPLATES, roleHasScopedPermission,
  type Paginated, type ProposalDetail, type ProposalDetailWithAmounts, type ProposalsQuerySchema, type ProposalSummary,
  type ProposalSummaryWithAmounts,
} from '@erp/domain';
import { withTransaction } from '../../../config/database';
import type { AuditTrailRepository } from '../../../core/audit';
import type { CountersRepository } from '../../../core/counters';
import { moneyToString } from '../../../core/decimal';
import { HttpError } from '../../../core/http-error';
import type { RequestUser } from '../../../core/middlewares/auth';
import type { RealtimePublisher } from '../../../core/realtime';
import type { BudgetMovementsRepository } from '../budget/budget.repository';
import { BUDGET_MOVEMENT_SERIES } from '../budget/budget.service';
import type { ProjectsRepository } from '../projects/projects.repository';
import type { ProposalDocument, ProposalsRepository } from './proposals.repository';

export const PROPOSAL_SERIES = 'PRO';
export const PROJECT_SERIES = 'OBR';

const notFound = () => new HttpError(404, 'PROPOSAL_NOT_FOUND', 'La propuesta no existe');
const notInReview = () => new HttpError(409, 'INVALID_TRANSITION', 'La propuesta ya no está en revisión');

type AnyProposalSummary = ProposalSummary | ProposalSummaryWithAmounts;
type AnyProposalDetail = ProposalDetail | ProposalDetailWithAmounts;

export function toProposalSummary(proposal: ProposalDocument): ProposalSummary {
  return {
    id: proposal._id,
    folio: proposal.folio,
    name: proposal.name,
    client: proposal.client,
    location: proposal.location,
    type: proposal.type,
    status: proposal.status,
    submittedAt: proposal.submittedAt?.toISOString() ?? null,
    certification: { type: proposal.sustainability.certification, level: proposal.sustainability.level },
  };
}

function toProposalDetail(proposal: ProposalDocument): ProposalDetail {
  return {
    ...toProposalSummary(proposal),
    scope: proposal.scope,
    materials: proposal.materials,
    estimatedStart: proposal.estimatedStart,
    estimatedEnd: proposal.estimatedEnd,
    targets: proposal.sustainability.targets,
    decidedAt: proposal.decidedAt?.toISOString() ?? null,
    decidedBy: proposal.decidedBy,
    rejectionReason: proposal.rejectionReason,
    projectId: proposal.projectId,
    createdBy: proposal.createdBy,
    createdAt: proposal.createdAt.toISOString(),
    updatedAt: proposal.updatedAt.toISOString(),
    custom: proposal.custom,
  };
}

export interface ProposalsDependencies {
  proposals: ProposalsRepository;
  projects: ProjectsRepository;
  budget: BudgetMovementsRepository;
  counters: CountersRepository;
  audit: AuditTrailRepository;
  publish: RealtimePublisher;
}

export class ProposalsService {
  public constructor(private readonly deps: ProposalsDependencies) {}

  async list(query: z.output<typeof ProposalsQuerySchema>, actor: RequestUser): Promise<Paginated<AnyProposalSummary>> {
    const { status, ...page } = query;
    const result = await this.deps.proposals.search(actor.tenantId, status, page);
    const withAmounts = this.canReadAmounts(actor);
    return {
      ...result,
      items: result.items.map((proposal): AnyProposalSummary => withAmounts
        ? { ...toProposalSummary(proposal), estimatedBudget: moneyToString(proposal.estimatedBudget) }
        : toProposalSummary(proposal)),
    };
  }

  async get(id: string, actor: RequestUser): Promise<AnyProposalDetail> {
    const proposal = await this.deps.proposals.findById(id, actor.tenantId);
    if (!proposal) throw notFound();
    return this.detail(proposal, actor);
  }

  /**
   * Aprueba la propuesta y crea su obra y su presupuesto inicial en una sola transacción: o queda todo
   * (propuesta aprobada, obra en planeación, movimiento inicial, bitácora y folios) o no queda nada.
   */
  async approve(id: string, actor: RequestUser): Promise<AnyProposalDetail> {
    const { tenantId } = actor;
    const approved = await withTransaction(async (session) => {
      const proposal = await this.deps.proposals.decide(
        id, tenantId, 'in_review', { status: 'approved', decidedAt: new Date(), decidedBy: actor.id, rejectionReason: null }, session,
      );
      if (!proposal) throw await this.decisionConflict(id, tenantId);

      const projectFolio = await this.deps.counters.next(tenantId, PROJECT_SERIES, session);
      const { certification, level, targets } = proposal.sustainability;
      const project = await this.deps.projects.insert({
        folio: projectFolio,
        proposalId: proposal._id,
        name: proposal.name,
        client: proposal.client,
        location: proposal.location,
        type: proposal.type,
        status: 'planning',
        progressPct: 0,
        phases: [],
        certification: {
          type: certification,
          level,
          requirements: CERTIFICATION_REQUIREMENT_TEMPLATES[certification]
            .map((requirement) => ({ ...requirement, status: 'pending' as const, note: '', updatedBy: null, updatedAt: null })),
        },
        impact: targets,
        archivedAt: null,
        archivedBy: null,
        deletedBy: null,
        custom: {},
      }, tenantId, session);

      const movementFolio = await this.deps.counters.next(tenantId, BUDGET_MOVEMENT_SERIES, session);
      await this.deps.budget.insert({
        tenantId, folio: movementFolio, projectId: project._id, kind: 'initial_budget', amount: proposal.estimatedBudget,
        reason: `Presupuesto de la propuesta ${proposal.folio}`, reversesMovementId: null, createdBy: actor.id,
      }, session);

      const entry = { tenantId, actorId: actor.id };
      await this.deps.audit.record({
        ...entry, action: 'proposal.approved', entityType: 'proposal', entityId: proposal._id,
        summary: `Aprobó la propuesta ${proposal.folio} y creó la obra ${projectFolio}`,
      }, session);
      await this.deps.audit.record({
        ...entry, action: 'project.created', entityType: 'project', entityId: project._id,
        summary: `Creó la obra ${projectFolio} al aprobar la propuesta ${proposal.folio}`,
      }, session);
      await this.deps.audit.record({
        ...entry, action: 'budget.initial', entityType: 'project', entityId: project._id,
        summary: `Registró el presupuesto inicial (${movementFolio})`,
      }, session);

      const linked = await this.deps.proposals.linkProject(proposal._id, tenantId, project._id, session);
      return linked ?? proposal;
    });

    this.deps.publish(tenantId, { type: 'construction.changed', entity: 'proposal', id: approved._id });
    this.deps.publish(tenantId, { type: 'construction.changed', entity: 'project', id: approved.projectId! });
    return this.detail(approved, actor);
  }

  async reject(id: string, reason: string, actor: RequestUser): Promise<AnyProposalDetail> {
    const { tenantId } = actor;
    const proposal = await this.deps.proposals.decide(
      id, tenantId, 'in_review', { status: 'rejected', decidedAt: new Date(), decidedBy: actor.id, rejectionReason: reason },
    );
    if (!proposal) throw await this.decisionConflict(id, tenantId);
    await this.deps.audit.record({
      tenantId, actorId: actor.id, action: 'proposal.rejected', entityType: 'proposal', entityId: proposal._id,
      summary: `Rechazó la propuesta ${proposal.folio}. Motivo: ${reason}`,
    });
    this.deps.publish(tenantId, { type: 'construction.changed', entity: 'proposal', id: proposal._id });
    return this.detail(proposal, actor);
  }

  /** La decisión no se aplicó: o la propuesta no existe (404) o ya no está en revisión (409). */
  private async decisionConflict(id: string, tenantId: string): Promise<HttpError> {
    return (await this.deps.proposals.findById(id, tenantId)) ? notInReview() : notFound();
  }

  private canReadAmounts(actor: RequestUser): boolean {
    return roleHasScopedPermission(actor.role, 'construction.budget:read_amounts');
  }

  private detail(proposal: ProposalDocument, actor: RequestUser): AnyProposalDetail {
    return this.canReadAmounts(actor)
      ? { ...toProposalDetail(proposal), estimatedBudget: moneyToString(proposal.estimatedBudget) }
      : toProposalDetail(proposal);
  }
}
