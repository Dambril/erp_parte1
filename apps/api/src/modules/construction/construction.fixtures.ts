import { Decimal128, type ClientSession } from 'mongodb';
import type {
  BudgetMovementKind, CertificationType, ImpactTargets, MoneyString, ProjectPhase, ProjectStatus, ProjectType, ProposalMaterial,
  ProposalStatus, RequirementStatus,
} from '@erp/domain';
import { CERTIFICATION_REQUIREMENT_TEMPLATES } from '@erp/domain';
import type { ConstructionRepositories } from './construction.container';
import type { BudgetMovementDocument } from './budget/budget.repository';
import { BUDGET_MOVEMENT_SERIES } from './budget/budget.service';
import type { ProjectDocument } from './projects/projects.repository';
import type { ProposalDocument } from './proposals/proposals.repository';
import { PROJECT_SERIES, PROPOSAL_SERIES } from './proposals/proposals.service';

// Carga directa de datos para el seed y las pruebas: en este bloque la API no crea propuestas (Bloque 3)
// ni registra gastos. Todo pasa por los repositories, con folios del contador y dentro de una transacción.

export interface ProposalFixture {
  name: string;
  client: string;
  location: string;
  type: ProjectType;
  scope: string;
  materials: ProposalMaterial[];
  estimatedStart: string | null;
  estimatedEnd: string | null;
  estimatedBudget: MoneyString;
  certification: CertificationType;
  level: string | null;
  targets: ImpactTargets;
  status: ProposalStatus;
}

export interface MovementFixture {
  kind: Exclude<BudgetMovementKind, 'initial_budget'>;
  amount: MoneyString;
  reason: string;
  /** Índice, dentro de `movements`, del ajuste que este corrige. */
  reverses?: number;
}

export interface ProjectFixture {
  name: string;
  client: string;
  location: string;
  type: ProjectType;
  status: ProjectStatus;
  progressPct: number;
  phases: ProjectPhase[];
  certification: CertificationType;
  level: string | null;
  /** Estado por código de requisito; los que falten quedan en `pending`. */
  requirements?: Record<string, RequirementStatus>;
  impact: ImpactTargets;
  initialBudget: MoneyString;
  movements?: MovementFixture[];
}

export async function insertProposal(
  repositories: ConstructionRepositories, tenantId: string, actorId: string, fixture: ProposalFixture, session: ClientSession,
): Promise<ProposalDocument> {
  const { client, estimatedBudget, certification, level, targets, status, ...fields } = fixture;
  return repositories.proposals.insert({
    ...fields,
    folio: await repositories.counters.next(tenantId, PROPOSAL_SERIES, session),
    client: { name: client },
    estimatedBudget: Decimal128.fromString(estimatedBudget),
    sustainability: { certification, level, targets },
    status,
    submittedAt: status === 'draft' ? null : new Date(),
    decidedAt: null,
    decidedBy: null,
    rejectionReason: null,
    projectId: null,
    createdBy: actorId,
    deletedBy: null,
    custom: {},
  }, tenantId, session);
}

export async function insertMovement(
  repositories: ConstructionRepositories, tenantId: string, actorId: string, projectId: string,
  movement: Pick<BudgetMovementDocument, 'kind' | 'reason' | 'reversesMovementId'> & { amount: MoneyString }, session: ClientSession,
): Promise<BudgetMovementDocument> {
  return repositories.budget.insert({
    ...movement,
    tenantId,
    projectId,
    folio: await repositories.counters.next(tenantId, BUDGET_MOVEMENT_SERIES, session),
    amount: Decimal128.fromString(movement.amount),
    createdBy: actorId,
  }, session);
}

/** Obra con su presupuesto inicial y, si se indican, ajustes y gastos. */
export async function insertProject(
  repositories: ConstructionRepositories, tenantId: string, actorId: string, fixture: ProjectFixture, session: ClientSession,
): Promise<ProjectDocument> {
  const folio = await repositories.counters.next(tenantId, PROJECT_SERIES, session);
  const project = await repositories.projects.insert({
    folio,
    proposalId: null,
    name: fixture.name,
    client: { name: fixture.client },
    location: fixture.location,
    type: fixture.type,
    status: fixture.status,
    progressPct: fixture.progressPct,
    phases: fixture.phases,
    certification: {
      type: fixture.certification,
      level: fixture.level,
      requirements: CERTIFICATION_REQUIREMENT_TEMPLATES[fixture.certification].map((requirement) => ({
        ...requirement, status: fixture.requirements?.[requirement.code] ?? 'pending', note: '', updatedBy: null, updatedAt: null,
      })),
    },
    impact: fixture.impact,
    archivedAt: null,
    archivedBy: null,
    deletedBy: null,
    custom: {},
  }, tenantId, session);

  await insertMovement(repositories, tenantId, actorId, project._id, {
    kind: 'initial_budget', amount: fixture.initialBudget, reason: 'Presupuesto inicial', reversesMovementId: null,
  }, session);
  const inserted: BudgetMovementDocument[] = [];
  for (const movement of fixture.movements ?? []) {
    inserted.push(await insertMovement(repositories, tenantId, actorId, project._id, {
      kind: movement.kind, amount: movement.amount, reason: movement.reason,
      reversesMovementId: movement.reverses === undefined ? null : inserted[movement.reverses]._id,
    }, session));
  }
  await repositories.audit.record({
    tenantId, actorId, action: 'project.created', entityType: 'project', entityId: project._id, summary: `Creó la obra ${folio}`,
  }, session);
  return project;
}
