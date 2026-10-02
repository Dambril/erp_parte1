import {
  computeDelayDays,
  type BudgetSummary, type BudgetSummaryWithAmounts, type CertificationRequirement, type ProjectDetail,
  type ProjectDetailWithAmounts, type ProjectListItem,
} from '@erp/domain';
import { moneyToString } from '../../../core/decimal';
import type { BudgetTotals } from '../budget/budget.repository';
import type { ProjectDocument, RequirementDocument } from './projects.repository';

export function toRequirement(requirement: RequirementDocument): CertificationRequirement {
  return { ...requirement, updatedAt: requirement.updatedAt?.toISOString() ?? null };
}

export function toProjectListItem(project: ProjectDocument, now: Date): ProjectListItem {
  return {
    id: project._id,
    folio: project.folio,
    name: project.name,
    client: project.client,
    location: project.location,
    type: project.type,
    status: project.status,
    progressPct: project.progressPct,
    certification: { type: project.certification.type, level: project.certification.level },
    deliveryDate: project.phases.at(-1)?.plannedEnd ?? null,
    delayDays: project.status === 'completed' ? 0 : computeDelayDays(project.phases, now),
    archivedAt: project.archivedAt?.toISOString() ?? null,
  };
}

/** Resumen sin montos: lo único que ve quien no tiene `construction.budget:read_amounts`. */
export function toBudgetSummary(totals: BudgetTotals): BudgetSummary {
  return { spentPct: totals.spentPct };
}

export function toBudgetSummaryWithAmounts(totals: BudgetTotals): BudgetSummaryWithAmounts {
  return {
    spentPct: totals.spentPct,
    currentBudget: moneyToString(totals.currentBudget),
    spent: moneyToString(totals.spent),
    available: moneyToString(totals.available),
  };
}

/** Detalle de la obra. `withAmounts` decide cuál de los dos tipos de `@erp/domain` se arma. */
export function toProjectDetail(project: ProjectDocument, totals: BudgetTotals, now: Date, withAmounts: true): ProjectDetailWithAmounts;
export function toProjectDetail(project: ProjectDocument, totals: BudgetTotals, now: Date, withAmounts: boolean): ProjectDetail | ProjectDetailWithAmounts;
export function toProjectDetail(project: ProjectDocument, totals: BudgetTotals, now: Date, withAmounts: boolean): ProjectDetail | ProjectDetailWithAmounts {
  return {
    ...toProjectListItem(project, now),
    proposalId: project.proposalId,
    phases: project.phases,
    requirements: project.certification.requirements.map(toRequirement),
    impact: project.impact,
    deletable: totals.otherMovements === 0,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    custom: project.custom,
    budget: withAmounts ? toBudgetSummaryWithAmounts(totals) : toBudgetSummary(totals),
  };
}
