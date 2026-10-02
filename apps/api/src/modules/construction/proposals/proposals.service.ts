import { Decimal128, type ClientSession } from 'mongodb';
import { ZodError, type z } from 'zod';
import {
  canTransitionProposal, CERTIFICATION_REQUIREMENT_TEMPLATES, ProposalSubmitSchema, roleHasScopedPermission,
  type Paginated, type ProposalDetail, type ProposalDetailWithAmounts, type ProposalDraft, type ProposalsQuerySchema,
  type ProposalSummary, type ProposalSummaryWithAmounts, type UpdateProposalSchema,
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
import type { ProposalContent, ProposalDocument, ProposalsRepository } from './proposals.repository';

export const PROPOSAL_SERIES = 'PRO';
export const PROJECT_SERIES = 'OBR';

const notFound = () => new HttpError(404, 'PROPOSAL_NOT_FOUND', 'La propuesta no existe');
const notInReview = () => new HttpError(409, 'INVALID_TRANSITION', 'La propuesta ya no está en revisión');
const notEditable = () => new HttpError(409, 'NOT_EDITABLE', 'Solo se puede editar una propuesta en borrador');
const notDraft = () => new HttpError(409, 'INVALID_TRANSITION', 'Solo un borrador se puede enviar a revisión');
const notDeletable = () => new HttpError(409, 'INVALID_TRANSITION', 'Solo se elimina una propuesta en borrador o rechazada');
const incomplete = () => new HttpError(409, 'PROPOSAL_INCOMPLETE', 'La propuesta está incompleta y no se puede aprobar');

type AnyProposalSummary = ProposalSummary | ProposalSummaryWithAmounts;
type AnyProposalDetail = ProposalDetail | ProposalDetailWithAmounts;

function toCertification({ certification, level }: ProposalDocument['sustainability']): ProposalSummary['certification'] {
  return certification ? { type: certification, level } : null;
}

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
    certification: toCertification(proposal.sustainability),
  };
}

const budgetToString = (proposal: ProposalDocument) => (proposal.estimatedBudget ? moneyToString(proposal.estimatedBudget) : null);
const toBudget = (amount: string | null) => (amount ? Decimal128.fromString(amount) : null);

function toContent(input: ProposalDraft): ProposalContent {
  const { certification, targets, estimatedBudget, ...fields } = input;
  return {
    ...fields,
    estimatedBudget: toBudget(estimatedBudget),
    sustainability: { certification: certification?.type ?? null, level: certification?.level ?? null, targets },
  };
}

/** Solo lo enviado cambia. Certificación y metas viven juntas en `sustainability`: lo no enviado conserva su valor. */
function toChanges(input: z.output<typeof UpdateProposalSchema>, current: ProposalDocument): Partial<ProposalContent> {
  const { certification, targets, estimatedBudget, ...fields } = input;
  // Sin claves `undefined`: Mongo las guardaría como `null`.
  const changes: Partial<ProposalContent> = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
  if (estimatedBudget !== undefined) changes.estimatedBudget = toBudget(estimatedBudget);
  if (certification !== undefined || targets !== undefined) {
    changes.sustainability = {
      certification: certification === undefined ? current.sustainability.certification : certification?.type ?? null,
      level: certification === undefined ? current.sustainability.level : certification?.level ?? null,
      targets: targets ?? current.sustainability.targets,
    };
  }
  return changes;
}

/** La propuesta tal como la exige `ProposalSubmitSchema`. */
function toSubmitInput(proposal: ProposalDocument) {
  return {
    name: proposal.name,
    client: proposal.client,
    location: proposal.location,
    type: proposal.type,
    scope: proposal.scope,
    estimatedStart: proposal.estimatedStart,
    estimatedEnd: proposal.estimatedEnd,
    estimatedBudget: budgetToString(proposal),
    certification: toCertification(proposal.sustainability),
    targets: proposal.sustainability.targets,
    materials: proposal.materials,
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
    const { status, q, ...page } = query;
    const result = await this.deps.proposals.search(actor.tenantId, { status, q }, page);
    const withAmounts = this.canReadAmounts(actor);
    return {
      ...result,
      items: result.items.map((proposal): AnyProposalSummary => withAmounts
        ? { ...toProposalSummary(proposal), estimatedBudget: budgetToString(proposal) }
        : toProposalSummary(proposal)),
    };
  }

  async get(id: string, actor: RequestUser): Promise<AnyProposalDetail> {
    const proposal = await this.deps.proposals.findById(id, actor.tenantId);
    if (!proposal) throw notFound();
    return this.detail(proposal, actor);
  }

  /** Crea un borrador con su folio `PRO`; el folio y el borrador se guardan juntos o no se guarda nada. */
  async create(input: ProposalDraft, actor: RequestUser): Promise<AnyProposalDetail> {
    const { tenantId } = actor;
    const proposal = await withTransaction(async (session) => {
      const folio = await this.deps.counters.next(tenantId, PROPOSAL_SERIES, session);
      const created = await this.deps.proposals.insert({
        ...toContent(input), folio, status: 'draft', submittedAt: null, decidedAt: null, decidedBy: null, rejectionReason: null,
        projectId: null, createdBy: actor.id, deletedBy: null,
      }, tenantId, session);
      await this.record(created, actor, 'proposal.created', `Creó el borrador de la propuesta ${folio}`, session);
      return created;
    });
    return this.changed(proposal, actor);
  }

  async update(id: string, input: z.output<typeof UpdateProposalSchema>, actor: RequestUser): Promise<AnyProposalDetail> {
    const { tenantId } = actor;
    const current = await this.deps.proposals.findById(id, tenantId);
    if (!current) throw notFound();
    if (current.status !== 'draft') throw notEditable();

    // El esquema solo compara las fechas que llegan juntas: aquí se compara contra la que ya estaba guardada.
    const start = input.estimatedStart === undefined ? current.estimatedStart : input.estimatedStart;
    const end = input.estimatedEnd === undefined ? current.estimatedEnd : input.estimatedEnd;
    if (start && end && end <= start) {
      throw new ZodError([{ code: 'custom', path: ['estimatedEnd'], message: 'La fecha de entrega debe ser posterior a la de inicio' }]);
    }

    const proposal = await this.deps.proposals.updateDraft(id, tenantId, toChanges(input, current));
    // Alguien la envió o la eliminó mientras tanto.
    if (!proposal) throw (await this.deps.proposals.findById(id, tenantId)) ? notEditable() : notFound();
    await this.record(proposal, actor, 'proposal.updated', `Editó el borrador de la propuesta ${proposal.folio}`);
    return this.changed(proposal, actor);
  }

  /**
   * `draft` → `in_review`. Se valida lo guardado, no lo que diga el cliente; un borrador incompleto sale como
   * `VALIDATION_ERROR` con el detalle por campo. Lectura, validación y cambio van en una transacción para que
   * una edición simultánea no deje en revisión algo distinto de lo validado.
   */
  async submit(id: string, actor: RequestUser): Promise<AnyProposalDetail> {
    const { tenantId } = actor;
    const proposal = await withTransaction(async (session) => {
      const current = await this.deps.proposals.findById(id, tenantId, session);
      if (!current) throw notFound();
      if (!canTransitionProposal(current.status, 'in_review')) throw notDraft();
      ProposalSubmitSchema.parse(toSubmitInput(current));

      const submitted = await this.deps.proposals.submit(id, tenantId, session);
      if (!submitted) throw notDraft();
      await this.record(submitted, actor, 'proposal.submitted', `Envió a revisión la propuesta ${submitted.folio}`, session);
      return submitted;
    });
    return this.changed(proposal, actor);
  }

  /** Borrado lógico; se restaura desde la Papelera. */
  async remove(id: string, actor: RequestUser): Promise<void> {
    const { tenantId } = actor;
    const proposal = await withTransaction(async (session) => {
      const deleted = await this.deps.proposals.softDelete(id, tenantId, actor.id, session);
      if (!deleted) throw (await this.deps.proposals.findById(id, tenantId, session)) ? notDeletable() : notFound();
      await this.record(deleted, actor, 'proposal.deleted', `Eliminó la propuesta ${deleted.folio}`, session);
      return deleted;
    });
    this.deps.publish(tenantId, { type: 'construction.changed', entity: 'proposal', id: proposal._id });
  }

  async restore(id: string, actor: RequestUser): Promise<AnyProposalDetail> {
    const proposal = await withTransaction(async (session) => {
      const restored = await this.deps.proposals.restore(id, actor.tenantId, session);
      if (!restored) throw notFound();
      await this.record(restored, actor, 'proposal.restored', `Restauró la propuesta ${restored.folio} desde la Papelera`, session);
      return restored;
    });
    return this.changed(proposal, actor);
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

      // Enviar a revisión ya exige todo; esto solo protege de datos cargados por fuera de la API.
      const { client, location, type, estimatedBudget } = proposal;
      const { certification, level, targets } = proposal.sustainability;
      if (!client || !location || !type || !estimatedBudget || !certification) throw incomplete();

      const projectFolio = await this.deps.counters.next(tenantId, PROJECT_SERIES, session);
      const project = await this.deps.projects.insert({
        folio: projectFolio,
        proposalId: proposal._id,
        name: proposal.name,
        client,
        location,
        type,
        status: 'planning',
        progressPct: 0,
        phases: [],
        certification: {
          type: certification,
          level,
          requirements: CERTIFICATION_REQUIREMENT_TEMPLATES[certification]
            .map((requirement) => ({ ...requirement, status: 'pending' as const, note: '', updatedBy: null, updatedAt: null })),
        },
        // Las metas son opcionales en la propuesta; la obra nace con 0 en las que no se fijaron.
        impact: {
          co2TonsPerYear: targets.co2TonsPerYear ?? 0,
          energySavingPct: targets.energySavingPct ?? 0,
          waterM3PerYear: targets.waterM3PerYear ?? 0,
        },
        archivedAt: null,
        archivedBy: null,
        deletedBy: null,
        custom: {},
      }, tenantId, session);

      const movementFolio = await this.deps.counters.next(tenantId, BUDGET_MOVEMENT_SERIES, session);
      await this.deps.budget.insert({
        tenantId, folio: movementFolio, projectId: project._id, kind: 'initial_budget', amount: estimatedBudget,
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
      ? { ...toProposalDetail(proposal), estimatedBudget: budgetToString(proposal) }
      : toProposalDetail(proposal);
  }

  private record(proposal: ProposalDocument, actor: RequestUser, action: string, summary: string, session?: ClientSession): Promise<void> {
    return this.deps.audit.record(
      { tenantId: actor.tenantId, actorId: actor.id, action, entityType: 'proposal', entityId: proposal._id, summary }, session,
    );
  }

  /** Avisa por el canal de tiempo real y devuelve el detalle. */
  private changed(proposal: ProposalDocument, actor: RequestUser): AnyProposalDetail {
    this.deps.publish(actor.tenantId, { type: 'construction.changed', entity: 'proposal', id: proposal._id });
    return this.detail(proposal, actor);
  }
}
