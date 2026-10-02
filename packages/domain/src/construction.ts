import { z } from 'zod';
import { CustomFieldsSchema, PaginationQuerySchema } from './common';

// ── Dinero ─────────────────────────────────────────────────────────
// En JSON el dinero es un string con dos decimales ("38600000.00"); nunca se convierte a `number`.

export const MoneyStringSchema = z.string().trim()
  .regex(/^-?\d{1,13}\.\d{2}$/, 'Monto con dos decimales, por ejemplo "38600000.00"');
export const NonZeroMoneySchema = MoneyStringSchema.refine((value) => /[1-9]/.test(value), 'El monto no puede ser cero');
export type MoneyString = string;

export function isNegativeMoney(amount: MoneyString): boolean {
  return amount.startsWith('-');
}

/** Monto contrario, trabajando sobre el string: `"1200.00"` → `"-1200.00"`. */
export function negateMoney(amount: MoneyString): MoneyString {
  return isNegativeMoney(amount) ? amount.slice(1) : `-${amount}`;
}

/** `"38600000.00"` → `"$38,600,000.00"`; `"-1200.50"` → `"-$1,200.50"`. */
export function formatMoney(amount: MoneyString): string {
  const negative = isNegativeMoney(amount);
  const [integer, fraction = '00'] = (negative ? amount.slice(1) : amount).split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}$${grouped}.${fraction.padEnd(2, '0')}`;
}

// ── Estados y catálogos fijos ──────────────────────────────────────

export const ProposalStatusSchema = z.enum(['draft', 'in_review', 'approved', 'rejected']);
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>;
export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: 'Borrador', in_review: 'En revisión', approved: 'Aprobada', rejected: 'Rechazada',
};

export const ProjectStatusSchema = z.enum(['planning', 'in_progress', 'certifying', 'completed']);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: 'Planeación', in_progress: 'En progreso', certifying: 'Certificando', completed: 'Completada',
};

export const ProjectTypeSchema = z.enum(['residential', 'commercial', 'industrial', 'public']);
export type ProjectType = z.infer<typeof ProjectTypeSchema>;
export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  residential: 'Residencial', commercial: 'Comercial', industrial: 'Industrial', public: 'Pública',
};

export const PhaseStatusSchema = z.enum(['pending', 'in_progress', 'completed']);
export type PhaseStatus = z.infer<typeof PhaseStatusSchema>;
export const PHASE_STATUS_LABEL: Record<PhaseStatus, string> = {
  pending: 'Pendiente', in_progress: 'En curso', completed: 'Completada',
};

export const CertificationTypeSchema = z.enum(['none', 'EDGE', 'LEED']);
export type CertificationType = z.infer<typeof CertificationTypeSchema>;

export const RequirementStatusSchema = z.enum(['pending', 'in_review', 'met']);
export type RequirementStatus = z.infer<typeof RequirementStatusSchema>;
export const REQUIREMENT_STATUS_LABEL: Record<RequirementStatus, string> = {
  pending: 'Pendiente', in_review: 'En revisión', met: 'Cumplido',
};

export const BudgetMovementKindSchema = z.enum(['initial_budget', 'adjustment', 'expense']);
export type BudgetMovementKind = z.infer<typeof BudgetMovementKindSchema>;
export const BUDGET_MOVEMENT_KIND_LABEL: Record<BudgetMovementKind, string> = {
  initial_budget: 'Presupuesto inicial', adjustment: 'Ajuste', expense: 'Gasto',
};

// ── Ciclo de vida ──────────────────────────────────────────────────

export const PROPOSAL_TRANSITIONS: Record<ProposalStatus, readonly ProposalStatus[]> = {
  draft: ['in_review'],
  in_review: ['approved', 'rejected'],
  approved: [],
  rejected: [],
};

export const PROJECT_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  planning: ['in_progress'],
  in_progress: ['certifying'],
  certifying: ['completed'],
  completed: [],
};

export function canTransitionProject(from: ProjectStatus, to: ProjectStatus): boolean {
  return PROJECT_TRANSITIONS[from].includes(to);
}

export function canTransitionProposal(from: ProposalStatus, to: ProposalStatus): boolean {
  return PROPOSAL_TRANSITIONS[from].includes(to);
}

// ── Retraso ────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fecha `AAAA-MM-DD` (UTC) de un instante. */
export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Fase en curso de una obra: la primera con estado `in_progress`. */
export function currentPhase<T extends { status: PhaseStatus }>(phases: readonly T[]): T | undefined {
  return phases.find((phase) => phase.status === 'in_progress');
}

/**
 * Días transcurridos desde la fecha planeada de fin de la fase en curso, si ya pasó. "Retrasada" no es un
 * estado de la obra: se calcula al leer. Devuelve 0 si no hay fase en curso o todavía está en plazo.
 */
export function computeDelayDays(phases: readonly { status: PhaseStatus; plannedEnd: string }[], now: Date): number {
  const phase = currentPhase(phases);
  if (!phase) return 0;
  const days = Math.floor((Date.parse(toISODate(now)) - Date.parse(phase.plannedEnd)) / DAY_MS);
  return days > 0 ? days : 0;
}

// ── Requisitos de certificación ────────────────────────────────────

/** Requisitos con los que nace una obra según su certificación objetivo. */
export const CERTIFICATION_REQUIREMENT_TEMPLATES: Record<CertificationType, readonly { code: string; title: string }[]> = {
  none: [],
  EDGE: [
    { code: 'EDGE-ENERGY', title: 'Ahorro de energía de al menos 20%' },
    { code: 'EDGE-WATER', title: 'Ahorro de agua de al menos 20%' },
    { code: 'EDGE-MATERIALS', title: 'Reducción de energía incorporada en materiales de al menos 20%' },
  ],
  LEED: [
    { code: 'LEED-LT', title: 'Ubicación y transporte' },
    { code: 'LEED-SS', title: 'Sitios sostenibles' },
    { code: 'LEED-WE', title: 'Eficiencia en agua' },
    { code: 'LEED-EA', title: 'Energía y atmósfera' },
    { code: 'LEED-MR', title: 'Materiales y recursos' },
    { code: 'LEED-EQ', title: 'Calidad ambiental interior' },
  ],
};

// ── Esquemas de entrada ────────────────────────────────────────────

const text = (max: number) => z.string().trim().min(1).max(max);
const DateSchema = z.string().date('Fecha en formato AAAA-MM-DD');
const PageSchema = PaginationQuerySchema.omit({ q: true });

export const ProjectsQuerySchema = PaginationQuerySchema.extend({
  status: ProjectStatusSchema.optional(),
  /** `true` lista solo las archivadas (exige `construction.projects:archive`). */
  archived: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
});
export type ProjectsQuery = z.input<typeof ProjectsQuerySchema>;

export const ProposalsQuerySchema = PageSchema.extend({ status: ProposalStatusSchema.optional() });
export type ProposalsQuery = z.input<typeof ProposalsQuerySchema>;

export const PageQuerySchema = PageSchema;
export type PageQuery = z.input<typeof PageQuerySchema>;

export const PhaseInputSchema = z.object({
  /** Identificador estable de la fase; si falta, la API lo genera. */
  key: z.string().trim().min(1).max(64).optional(),
  name: text(120),
  plannedStart: DateSchema,
  plannedEnd: DateSchema,
  status: PhaseStatusSchema,
}).refine((phase) => phase.plannedStart <= phase.plannedEnd, {
  message: 'La fecha de fin es anterior a la de inicio', path: ['plannedEnd'],
});
export type PhaseInput = z.input<typeof PhaseInputSchema>;

/** Datos generales, cronograma y avance. El estado cambia con `/transition`; el presupuesto, con movimientos. */
export const UpdateProjectSchema = z.object({
  name: text(160),
  client: z.object({ name: text(160) }),
  location: text(160),
  type: ProjectTypeSchema,
  progressPct: z.number().int().min(0).max(100),
  /** La lista enviada reemplaza a la actual. */
  phases: z.array(PhaseInputSchema).max(50),
  custom: CustomFieldsSchema,
}).partial().strict().refine((body) => Object.keys(body).length > 0, { message: 'Sin cambios' });
export type UpdateProjectRequest = z.input<typeof UpdateProjectSchema>;

export const TransitionProjectSchema = z.object({ to: ProjectStatusSchema });
export type TransitionProjectRequest = z.infer<typeof TransitionProjectSchema>;

export const RejectProposalSchema = z.object({ reason: text(1000) });
export type RejectProposalRequest = z.infer<typeof RejectProposalSchema>;

/** Siempre crea un `adjustment`: positivo aumenta el presupuesto, negativo lo reduce. */
export const CreateBudgetMovementSchema = z.object({
  amount: NonZeroMoneySchema,
  reason: text(500),
  /** Movimiento que este corrige; exige el monto exactamente contrario. */
  reversesMovementId: z.string().uuid().optional(),
});
export type CreateBudgetMovementRequest = z.infer<typeof CreateBudgetMovementSchema>;

export const UpdateRequirementSchema = z.object({
  status: RequirementStatusSchema,
  note: z.string().trim().max(1000).default(''),
});
export type UpdateRequirementRequest = z.input<typeof UpdateRequirementSchema>;

// ── Formas de salida (JSON de la API) ──────────────────────────────
// Cada respuesta con dinero tiene dos tipos: el base, sin montos, y el `WithAmounts`, que solo se arma
// para quien tiene `construction.budget:read_amounts`. Ocultar montos es responsabilidad de la API.

export interface ClientRef { name: string }

export interface ImpactTargets {
  co2TonsPerYear: number;
  energySavingPct: number;
  waterM3PerYear: number;
}

export interface ProposalMaterial { name: string; origin: string; supplier: string }

export interface ProposalSummary {
  id: string;
  folio: string;
  name: string;
  client: ClientRef;
  location: string;
  type: ProjectType;
  status: ProposalStatus;
  submittedAt: string | null;
  certification: { type: CertificationType; level: string | null };
}
export interface ProposalSummaryWithAmounts extends ProposalSummary { estimatedBudget: MoneyString }

export interface ProposalDetail extends ProposalSummary {
  scope: string;
  materials: ProposalMaterial[];
  estimatedStart: string | null;
  estimatedEnd: string | null;
  targets: ImpactTargets;
  decidedAt: string | null;
  decidedBy: string | null;
  rejectionReason: string | null;
  /** Obra creada al aprobar. */
  projectId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  custom: Record<string, unknown>;
}
export interface ProposalDetailWithAmounts extends ProposalDetail { estimatedBudget: MoneyString }

export interface ProjectPhase {
  key: string;
  name: string;
  plannedStart: string;
  plannedEnd: string;
  status: PhaseStatus;
}

export interface CertificationRequirement {
  code: string;
  title: string;
  status: RequirementStatus;
  note: string;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface ProjectListItem {
  id: string;
  folio: string;
  name: string;
  client: ClientRef;
  location: string;
  type: ProjectType;
  status: ProjectStatus;
  progressPct: number;
  certification: { type: CertificationType; level: string | null };
  /** Fin planeado de la última fase. */
  deliveryDate: string | null;
  delayDays: number;
  archivedAt: string | null;
}

export interface BudgetSummary {
  /** Porcentaje entero del presupuesto vigente que ya se gastó. */
  spentPct: number;
}
export interface BudgetSummaryWithAmounts extends BudgetSummary {
  /** Presupuesto inicial más ajustes. */
  currentBudget: MoneyString;
  spent: MoneyString;
  available: MoneyString;
}

interface ProjectDetailBase extends ProjectListItem {
  proposalId: string | null;
  phases: ProjectPhase[];
  requirements: CertificationRequirement[];
  impact: ImpactTargets;
  /** `false` si el presupuesto tiene algo más que el movimiento inicial. */
  deletable: boolean;
  createdAt: string;
  updatedAt: string;
  custom: Record<string, unknown>;
}
export interface ProjectDetail extends ProjectDetailBase { budget: BudgetSummary }
export interface ProjectDetailWithAmounts extends ProjectDetailBase { budget: BudgetSummaryWithAmounts }

export interface BudgetMovement {
  id: string;
  folio: string;
  projectId: string;
  kind: BudgetMovementKind;
  /** Con signo: un ajuste negativo reduce el presupuesto. */
  amount: MoneyString;
  reason: string;
  reversesMovementId: string | null;
  /** Ya tiene una corrección registrada: no se puede corregir otra vez. */
  reversed: boolean;
  createdBy: string;
  createdAt: string;
}

export interface ActivityEntry {
  id: string;
  action: string;
  summary: string;
  actorId: string;
  actorName: string;
  at: string;
}

export interface DashboardKpis {
  activeProjects: number;
  averageProgressPct: number;
  co2TonsPerYear: number;
  budgetSpentPct: number;
}

export interface DashboardCertification {
  projectId: string;
  projectName: string;
  type: CertificationType;
  level: string | null;
  requirementsMet: number;
  requirementsTotal: number;
}

export type AttentionItem =
  | { kind: 'proposal_in_review'; proposalId: string; folio: string; name: string; submittedAt: string | null }
  | { kind: 'project_delayed'; projectId: string; folio: string; name: string; delayDays: number }
  | { kind: 'budget_near_limit'; projectId: string; folio: string; name: string; spentPct: number }
  | { kind: 'requirement_pending'; projectId: string; folio: string; name: string; code: string; title: string };

/** Porcentaje ejercido a partir del cual una obra aparece en "Requiere tu atención". */
export const BUDGET_ATTENTION_PCT = 90;

export interface Dashboard {
  kpis: DashboardKpis;
  projectsInProgress: ProjectListItem[];
  certificationsInProgress: DashboardCertification[];
  /** Solo está presente si el usuario puede actuar sobre alguno de los grupos. */
  attention?: AttentionItem[];
}

/** Aviso del canal de tiempo real: no lleva datos (ni montos); el cliente vuelve a consultar. */
export interface ConstructionChangedEvent {
  type: 'construction.changed';
  entity: 'project' | 'proposal';
  id: string;
}
