import {
  parseMoneyInput,
  type CertificationType, type ProjectType, type ProposalDetail, type ProposalDraftRequest,
} from '@erp/domain';
import {MONEY_INPUT_ERROR} from '../components/MoneyField';

// Estado del formulario de propuesta y su conversión al cuerpo que espera la API. El monto viaja siempre
// como string (`parseMoneyInput`); las metas de impacto no son dinero y sí se convierten a número.

export interface MaterialRow {
  /** Identidad de la fila dentro del formulario. */
  formId: string;
  name: string;
  origin: string;
  supplier: string;
}

export interface ProposalFormState {
  name: string;
  clientName: string;
  location: string;
  type: ProjectType | null;
  scope: string;
  estimatedStart: string | null;
  estimatedEnd: string | null;
  budget: string;
  certification: CertificationType | null;
  level: string | null;
  co2: string;
  energy: string;
  water: string;
  materials: MaterialRow[];
}

/** Errores por campo del formulario (`clientName`, `material:<formId>:origin`…). */
export type FieldErrors = Record<string, string>;

export const STEP_TITLES = ['Datos generales', 'Fechas y presupuesto', 'Sustentabilidad y materiales', 'Revisión'] as const;

let nextRowId = 0;
export const newMaterialRow = (): MaterialRow => ({formId: `row-${nextRowId++}`, name: '', origin: '', supplier: ''});

export const EMPTY_FORM: ProposalFormState = {
  name: '', clientName: '', location: '', type: null, scope: '', estimatedStart: null, estimatedEnd: null, budget: '',
  certification: null, level: null, co2: '', energy: '', water: '', materials: [],
};

const numberText = (value: number | null) => (value === null ? '' : String(value));

export function fromDetail(proposal: ProposalDetail & {estimatedBudget?: string | null}): ProposalFormState {
  return {
    name: proposal.name,
    clientName: proposal.client?.name ?? '',
    location: proposal.location ?? '',
    type: proposal.type,
    scope: proposal.scope ?? '',
    estimatedStart: proposal.estimatedStart,
    estimatedEnd: proposal.estimatedEnd,
    budget: proposal.estimatedBudget ?? '',
    certification: proposal.certification?.type ?? null,
    level: proposal.certification?.level ?? null,
    co2: numberText(proposal.targets.co2TonsPerYear),
    energy: numberText(proposal.targets.energySavingPct),
    water: numberText(proposal.targets.waterM3PerYear),
    materials: proposal.materials.map((material) => ({...newMaterialRow(), ...material})),
  };
}

const NUMBER = /^\d{1,10}(\.\d{1,2})?$/;

export interface ProposalRequest {
  body: ProposalDraftRequest;
  /** Errores de captura que no llegan a la API (un monto o una cifra mal escritos). */
  errors: FieldErrors;
  /** `formId` de cada material enviado, en orden: traduce `materials.0.origin` a su fila. */
  materialIds: string[];
}

export function toRequest(form: ProposalFormState): ProposalRequest {
  const errors: FieldErrors = {};
  const text = (value: string) => value.trim() || null;
  const target = (value: string, field: string): number | null => {
    if (!value.trim()) return null;
    if (NUMBER.test(value.trim())) return Number(value.trim());
    errors[field] = 'Escribe una cifra, por ejemplo 120 o 12.5';
    return null;
  };

  let estimatedBudget: string | null = null;
  if (form.budget.trim()) {
    estimatedBudget = parseMoneyInput(form.budget);
    if (!estimatedBudget) errors.budget = MONEY_INPUT_ERROR;
  }
  // Una fila sin nada escrito no se envía.
  const rows = form.materials.filter((row) => row.name.trim() || row.origin.trim() || row.supplier.trim());

  return {
    body: {
      name: form.name,
      client: text(form.clientName) ? {name: form.clientName} : null,
      location: text(form.location),
      type: form.type,
      scope: text(form.scope),
      estimatedStart: form.estimatedStart,
      estimatedEnd: form.estimatedEnd,
      estimatedBudget,
      certification: form.certification ? {type: form.certification, level: form.certification === 'none' ? null : form.level} : null,
      targets: {co2TonsPerYear: target(form.co2, 'co2'), energySavingPct: target(form.energy, 'energy'), waterM3PerYear: target(form.water, 'water')},
      materials: rows.map(({name, origin, supplier}) => ({name, origin, supplier})),
    },
    errors,
    materialIds: rows.map((row) => row.formId),
  };
}

const PATH_FIELD: Record<string, string> = {
  client: 'clientName',
  'client.name': 'clientName',
  estimatedBudget: 'budget',
  'certification.type': 'certification',
  'certification.level': 'level',
  'targets.co2TonsPerYear': 'co2',
  'targets.energySavingPct': 'energy',
  'targets.waterM3PerYear': 'water',
};

/** Campo del formulario al que corresponde la ruta de un error de Zod o de la API. */
export function formField(path: string, materialIds: string[]): string {
  const material = /^materials\.(\d+)\.(\w+)$/.exec(path);
  if (material) return `material:${materialIds[Number(material[1])] ?? ''}:${material[2]}`;
  return PATH_FIELD[path] ?? path;
}

/** Primer mensaje por campo. */
export function toFieldErrors(issues: {path: (string | number)[] | string; message: string}[], materialIds: string[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const field = formField(Array.isArray(issue.path) ? issue.path.join('.') : issue.path, materialIds);
    if (!errors[field]) errors[field] = issue.message;
  }
  return errors;
}

const STEP_FIELDS: readonly (readonly string[])[] = [
  ['name', 'clientName', 'location', 'type', 'scope'],
  ['estimatedStart', 'estimatedEnd', 'budget'],
  ['certification', 'level', 'co2', 'energy', 'water', 'materials'],
];

export function stepOf(field: string): number {
  if (field.startsWith('material')) return 2;
  const step = STEP_FIELDS.findIndex((fields) => fields.includes(field));
  return step === -1 ? 0 : step;
}

/** Errores que pertenecen a un paso. */
export function errorsOfStep(errors: FieldErrors, step: number): FieldErrors {
  return Object.fromEntries(Object.entries(errors).filter(([field]) => stepOf(field) === step));
}

export const FIELD_LABEL: Record<string, string> = {
  name: 'Nombre', clientName: 'Cliente', location: 'Ubicación', type: 'Tipo de obra', scope: 'Alcance',
  estimatedStart: 'Inicio estimado', estimatedEnd: 'Entrega estimada', budget: 'Presupuesto estimado',
  certification: 'Certificación objetivo', level: 'Nivel de certificación', co2: 'CO₂ evitado', energy: 'Ahorro de energía',
  water: 'Agua captada', materials: 'Materiales',
};

/** "Cliente, Ubicación y Materiales" a partir de los campos con error. */
export function describeMissing(errors: FieldErrors): string {
  const labels = [...new Set(Object.keys(errors).map((field) => FIELD_LABEL[field] ?? (field.startsWith('material') ? 'Materiales' : field)))];
  return labels.length <= 1 ? labels.join('') : `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
}
