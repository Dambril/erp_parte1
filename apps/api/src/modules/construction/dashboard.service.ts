import {
  BUDGET_ATTENTION_PCT, computeDelayDays, roleHasScopedPermission, toISODate,
  type AttentionItem, type Dashboard, type DashboardCertification, type ScopedPermission,
} from '@erp/domain';
import type { RequestUser } from '../../core/middlewares/auth';
import type { BudgetMovementsRepository } from './budget/budget.repository';
import { toProjectListItem } from './projects/projects.mapper';
import type { ProjectDocument, ProjectsRepository } from './projects/projects.repository';
import type { ProposalsRepository } from './proposals/proposals.repository';

const LIST_LIMIT = 5;
const ATTENTION_LIMIT = 20;

function toCertification(project: ProjectDocument): DashboardCertification {
  const { type, level, requirements } = project.certification;
  return {
    projectId: project._id,
    projectName: project.name,
    type,
    level,
    requirementsMet: requirements.filter((requirement) => requirement.status === 'met').length,
    requirementsTotal: requirements.length,
  };
}

export interface DashboardDependencies {
  projects: ProjectsRepository;
  proposals: ProposalsRepository;
  budget: BudgetMovementsRepository;
  now: () => Date;
}

/** Todo sale de agregaciones y consultas acotadas del servidor; no se traen las obras para sumar en memoria. */
export class DashboardService {
  public constructor(private readonly deps: DashboardDependencies) {}

  async get(actor: RequestUser): Promise<Dashboard> {
    const { tenantId } = actor;
    const now = this.deps.now();
    const [kpis, budgetSpentPct, inProgress, certifications, attention] = await Promise.all([
      this.deps.projects.kpis(tenantId),
      this.deps.budget.portfolioSpentPct(tenantId),
      this.deps.projects.findInProgress(tenantId, LIST_LIMIT),
      this.deps.projects.findCertifications(tenantId, LIST_LIMIT),
      this.attention(actor, now),
    ]);
    return {
      kpis: { ...kpis, budgetSpentPct },
      projectsInProgress: inProgress.map((project) => toProjectListItem(project, now)),
      certificationsInProgress: certifications.map(toCertification),
      ...(attention ? { attention } : {}),
    };
  }

  /**
   * "Requiere tu atención": cada grupo solo se consulta si el usuario puede actuar sobre él.
   * Devuelve `undefined` (la sección no existe) para quien no tiene ninguno de esos permisos.
   */
  private async attention(actor: RequestUser, now: Date): Promise<AttentionItem[] | undefined> {
    const { tenantId } = actor;
    const allowed = (permission: ScopedPermission) => roleHasScopedPermission(actor.role, permission);
    const groups: Promise<AttentionItem[]>[] = [];

    if (allowed('construction.proposals:approve')) {
      groups.push(this.deps.proposals.findInReview(tenantId, ATTENTION_LIMIT).then((proposals) => proposals.map((proposal) => ({
        kind: 'proposal_in_review', proposalId: proposal._id, folio: proposal.folio, name: proposal.name,
        submittedAt: proposal.submittedAt?.toISOString() ?? null,
      }))));
    }
    if (allowed('construction.projects:update')) {
      groups.push(this.deps.projects.findDelayed(tenantId, toISODate(now), ATTENTION_LIMIT).then((projects) => projects.map((project) => ({
        kind: 'project_delayed', projectId: project._id, folio: project.folio, name: project.name,
        delayDays: computeDelayDays(project.phases, now),
      }))));
    }
    if (allowed('construction.budget:read_amounts')) {
      groups.push(this.deps.budget.findNearLimit(tenantId, BUDGET_ATTENTION_PCT, ATTENTION_LIMIT).then((rows) => rows.map((row) => ({
        kind: 'budget_near_limit', ...row,
      }))));
    }
    if (allowed('construction.certifications:update')) {
      groups.push(this.deps.projects.findCertifyingWithPending(tenantId, ATTENTION_LIMIT).then((projects) => projects.flatMap((project) =>
        project.certification.requirements
          .filter((requirement) => requirement.status === 'pending')
          .map((requirement): AttentionItem => ({
            kind: 'requirement_pending', projectId: project._id, folio: project.folio, name: project.name,
            code: requirement.code, title: requirement.title,
          })))));
    }
    return groups.length ? (await Promise.all(groups)).flat() : undefined;
  }
}
