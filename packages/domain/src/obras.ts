import { z } from 'zod';

// ── Etapas (persistidas) y estados (derivados) ─────────────────────
// La etapa la cambian las decisiones (aprobar / solicitar cambios). El estado que ven los
// usuarios se deriva de la etapa y del cronograma al momento de leer, así una obra pasa a
// "retrasada" sola cuando se le vence una fase, sin que nadie tenga que marcarla.

export const ObraEtapaSchema = z.enum(['propuesta', 'ejecucion', 'certificacion', 'completada']);
export type ObraEtapa = z.infer<typeof ObraEtapaSchema>;

export const ObraEstadoSchema = z.enum(['propuesta', 'en_progreso', 'retrasada', 'certificando', 'completada']);
export type ObraEstado = z.infer<typeof ObraEstadoSchema>;

export const OBRA_ESTADO_LABEL: Record<ObraEstado, string> = {
  propuesta: 'Propuesta',
  en_progreso: 'En progreso',
  retrasada: 'Retrasada',
  certificando: 'Certificando',
  completada: 'Completada',
};

// ── Esquemas de entrada ────────────────────────────────────────────

const Texto = (max: number) => z.string().trim().min(1).max(max);
const FechaSchema = z.string().date('Fecha en formato AAAA-MM-DD');
const CantidadSchema = z.number().finite().nonnegative();
// Dinero como cadena decimal (ADR 0001): nunca como number.
export const MontoSchema = z.string().trim().regex(/^\d{1,13}(\.\d{1,2})?$/, 'Monto decimal con hasta 2 decimales');

export const FaseInputSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  nombre: Texto(120),
  inicio: FechaSchema,
  fin: FechaSchema,
  avance: z.number().int().min(0).max(100),
}).refine((fase) => fase.inicio <= fase.fin, { message: 'La fecha de fin es anterior a la de inicio', path: ['fin'] });
export type FaseInput = z.infer<typeof FaseInputSchema>;

export const MaterialSchema = z.object({
  nombre: Texto(120),
  proveedor: Texto(120),
  origen: Texto(120),
  distanciaKm: CantidadSchema.nullable().default(null),
  certificacion: z.string().trim().max(80).nullable().default(null),
});
export type Material = z.infer<typeof MaterialSchema>;

export const PresupuestoSchema = z.object({
  moneda: z.string().trim().length(3).transform((value) => value.toUpperCase()).default('MXN'),
  total: MontoSchema,
  ejercido: MontoSchema.default('0'),
});
export type Presupuesto = z.infer<typeof PresupuestoSchema>;

export const CertificacionTipoSchema = z.enum(['LEED', 'EDGE']);
export const CertificacionEstadoSchema = z.enum(['en_preparacion', 'en_revision', 'obtenida']);
export const CertificacionSchema = z.object({
  tipo: CertificacionTipoSchema,
  nivelObjetivo: Texto(40),
  estado: CertificacionEstadoSchema.default('en_preparacion'),
});
export type Certificacion = z.infer<typeof CertificacionSchema>;

export const CERTIFICACION_ESTADO_LABEL: Record<Certificacion['estado'], string> = {
  en_preparacion: 'En preparación',
  en_revision: 'En revisión',
  obtenida: 'Obtenida',
};

export const ImpactoSchema = z.object({
  co2EvitadoKg: CantidadSchema,
  energiaAhorradaKwh: CantidadSchema,
  aguaCaptadaM3: CantidadSchema,
});
export type Impacto = z.infer<typeof ImpactoSchema>;

export const ImpactoEstimadoSchema = ImpactoSchema.extend({ descripcion: z.string().trim().max(1000).default('') });
export type ImpactoEstimado = z.infer<typeof ImpactoEstimadoSchema>;

export const CreateObraRequestSchema = z.object({
  nombre: Texto(160),
  cliente: Texto(160),
  ubicacion: Texto(160),
  alcance: z.string().trim().max(2000).default(''),
  presupuesto: PresupuestoSchema,
  certificacion: CertificacionSchema.nullable().default(null),
  impactoEstimado: ImpactoEstimadoSchema,
  materiales: z.array(MaterialSchema).max(100).default([]),
  fases: z.array(FaseInputSchema).max(50).default([]),
});
export type CreateObraRequest = z.infer<typeof CreateObraRequestSchema>;

// PATCH: cada campo enviado reemplaza al actual (las listas se reemplazan completas).
export const UpdateObraRequestSchema = CreateObraRequestSchema.partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Sin cambios' });
export type UpdateObraRequest = z.infer<typeof UpdateObraRequestSchema>;

export const MedicionRequestSchema = ImpactoSchema.extend({
  fecha: FechaSchema,
  fuente: Texto(200),
}).refine((m) => m.co2EvitadoKg + m.energiaAhorradaKwh + m.aguaCaptadaM3 > 0, { message: 'La medición no tiene valores' });
export type MedicionRequest = z.infer<typeof MedicionRequestSchema>;

export const AprobarRequestSchema = z.object({ comentario: z.string().trim().max(1000).optional() });
export const SolicitarCambiosRequestSchema = z.object({ comentario: Texto(1000) });

/** Lo que envía un cliente (antes de aplicar valores por defecto). */
export type CreateObraInput = z.input<typeof CreateObraRequestSchema>;
export type UpdateObraInput = z.input<typeof UpdateObraRequestSchema>;
export type MedicionInput = z.input<typeof MedicionRequestSchema>;

export const ObrasQuerySchema = z.object({
  estado: ObraEstadoSchema.optional(),
  q: z.string().trim().max(100).optional(),
});
export type ObrasQuery = z.infer<typeof ObrasQuerySchema>;

// ── Forma de salida (JSON de la API) ───────────────────────────────

export interface Autor { id: string; nombre: string }

export interface Fase { id: string; nombre: string; inicio: string; fin: string; avance: number }

export interface Medicion extends Impacto {
  id: string;
  fecha: string;
  fuente: string;
  registradoPor: Autor;
  registradoEn: string;
}

export interface Decision {
  accion: 'aprobada' | 'cambios_solicitados';
  deEtapa: ObraEtapa;
  aEtapa: ObraEtapa;
  comentario: string | null;
  autor: Autor;
  fecha: string;
}

export interface Obra {
  id: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
  nombre: string;
  cliente: string;
  ubicacion: string;
  alcance: string;
  etapa: ObraEtapa;
  /** Derivado de etapa + cronograma. */
  estado: ObraEstado;
  /** Promedio del avance de las fases (0-100). */
  avance: number;
  presupuesto: Presupuesto;
  certificacion: Certificacion | null;
  impactoEstimado: ImpactoEstimado;
  /** Suma de las mediciones registradas: el impacto real, no el declarado. */
  impactoMedido: Impacto;
  materiales: Material[];
  fases: Fase[];
  mediciones: Medicion[];
  decisiones: Decision[];
}

export type RealtimeEvent =
  | { type: 'obra.upsert'; obra: Obra }
  | { type: 'obra.delete'; id: string };

// ── Reglas de negocio compartidas ──────────────────────────────────

/** Puntos de avance por debajo de lo esperado a partir de los cuales una fase cuenta como retrasada. */
export const TOLERANCIA_RETRASO = 20;

const DIA_MS = 24 * 60 * 60 * 1000;

export function hoyISO(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Avance esperado (0-100) de una fase si avanzara de forma lineal entre inicio y fin. */
export function avanceEsperado(fase: Pick<Fase, 'inicio' | 'fin'>, hoy: string): number {
  if (hoy < fase.inicio) return 0;
  if (hoy >= fase.fin) return 100;
  const total = Date.parse(fase.fin) - Date.parse(fase.inicio) + DIA_MS;
  const transcurrido = Date.parse(hoy) - Date.parse(fase.inicio) + DIA_MS;
  return Math.round((transcurrido / total) * 100);
}

export function faseRetrasada(fase: Pick<Fase, 'inicio' | 'fin' | 'avance'>, hoy: string): boolean {
  if (fase.avance >= 100) return false;
  if (hoy > fase.fin) return true;
  return avanceEsperado(fase, hoy) - fase.avance >= TOLERANCIA_RETRASO;
}

export function calcularAvance(fases: Pick<Fase, 'avance'>[]): number {
  if (fases.length === 0) return 0;
  return Math.round(fases.reduce((sum, fase) => sum + fase.avance, 0) / fases.length);
}

export function derivarEstado(etapa: ObraEtapa, fases: Fase[], hoy: string): ObraEstado {
  switch (etapa) {
    case 'propuesta': return 'propuesta';
    case 'certificacion': return 'certificando';
    case 'completada': return 'completada';
    case 'ejecucion': return fases.some((fase) => faseRetrasada(fase, hoy)) ? 'retrasada' : 'en_progreso';
  }
}

export function sumarImpacto(items: Impacto[]): Impacto {
  const redondear = (n: number) => Math.round(n * 100) / 100;
  return items.reduce<Impacto>((acc, item) => ({
    co2EvitadoKg: redondear(acc.co2EvitadoKg + item.co2EvitadoKg),
    energiaAhorradaKwh: redondear(acc.energiaAhorradaKwh + item.energiaAhorradaKwh),
    aguaCaptadaM3: redondear(acc.aguaCaptadaM3 + item.aguaCaptadaM3),
  }), { co2EvitadoKg: 0, energiaAhorradaKwh: 0, aguaCaptadaM3: 0 });
}

// ── Transiciones de etapa ──────────────────────────────────────────

export type TransicionResultado = { ok: true; aEtapa: ObraEtapa } | { ok: false; code: string; message: string };

export function transicionAprobar(obra: Pick<Obra, 'etapa' | 'avance' | 'certificacion'>): TransicionResultado {
  switch (obra.etapa) {
    case 'propuesta':
      return { ok: true, aEtapa: 'ejecucion' };
    case 'ejecucion':
      if (obra.avance < 100) {
        return { ok: false, code: 'OBRA_INCOMPLETA', message: 'La obra debe tener todas sus fases al 100% antes de cerrarla' };
      }
      return { ok: true, aEtapa: obra.certificacion ? 'certificacion' : 'completada' };
    case 'certificacion':
      return { ok: true, aEtapa: 'completada' };
    case 'completada':
      return { ok: false, code: 'OBRA_COMPLETADA', message: 'La obra ya está completada' };
  }
}

export function transicionSolicitarCambios(obra: Pick<Obra, 'etapa'>): TransicionResultado {
  switch (obra.etapa) {
    case 'propuesta': return { ok: true, aEtapa: 'propuesta' };
    case 'certificacion': return { ok: true, aEtapa: 'ejecucion' };
    default:
      return { ok: false, code: 'TRANSICION_INVALIDA', message: 'Solo se pueden solicitar cambios a una propuesta o a una obra en certificación' };
  }
}

/** Texto del botón "aprobar" según la etapa; null si no hay acción disponible. */
export function etiquetaAprobar(etapa: ObraEtapa): string | null {
  switch (etapa) {
    case 'propuesta': return 'Aprobar propuesta';
    case 'ejecucion': return 'Cerrar obra';
    case 'certificacion': return 'Certificación obtenida';
    case 'completada': return null;
  }
}

// ── Dinero ─────────────────────────────────────────────────────────

export function montoACentavos(monto: string): bigint {
  const [enteros, decimales = ''] = monto.split('.');
  return BigInt(enteros) * 100n + BigInt(decimales.padEnd(2, '0').slice(0, 2));
}

export function centavosAMonto(centavos: bigint): string {
  const negativo = centavos < 0n;
  const abs = negativo ? -centavos : centavos;
  const texto = `${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
  return negativo ? `-${texto}` : texto;
}

/** Porcentaje entero de `parte` sobre `total` (0 si el total es 0). */
export function porcentajeMonto(parte: string, total: string): number {
  const totalCentavos = montoACentavos(total);
  if (totalCentavos === 0n) return 0;
  return Number((montoACentavos(parte) * 1000n) / totalCentavos) / 10;
}

// ── Formato para mostrar ───────────────────────────────────────────

export function formatearNumero(valor: number, decimales = 0): string {
  const [enteros, fraccion] = valor.toFixed(decimales).split('.');
  const conSeparadores = enteros.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraccion ? `${conSeparadores}.${fraccion}` : conSeparadores;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "2026-03-14" (o un ISO completo) → "14 mar 2026". */
export function formatearFecha(fecha: string): string {
  const [anio, mes, dia] = fecha.slice(0, 10).split('-');
  return `${Number(dia)} ${MESES[Number(mes) - 1]} ${anio}`;
}

/** Fecha local AAAA-MM-DD del dispositivo (`hoyISO` usa UTC, que en México ya es "mañana" por la noche). */
export function fechaLocalISO(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatearMonto(monto: string, moneda: string): string {
  const [enteros, decimales = '00'] = monto.split('.');
  const conSeparadores = enteros.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${conSeparadores}.${decimales.padEnd(2, '0')} ${moneda}`;
}

// ── Resumen del dashboard ──────────────────────────────────────────

export interface ResumenPresupuesto {
  moneda: string;
  total: string;
  ejercido: string;
  porcentajeEjercido: number;
}

export interface ResumenCertificacion {
  obraId: string;
  obraNombre: string;
  tipo: Certificacion['tipo'];
  nivelObjetivo: string;
  estado: Certificacion['estado'];
}

export interface ResumenObras {
  total: number;
  activas: number;
  propuestas: number;
  retrasadas: number;
  certificando: number;
  completadas: number;
  /** Promedio de avance de las obras activas (en ejecución o certificación). */
  avancePromedio: number;
  impactoMedido: Impacto;
  /** Un renglón por moneda: los montos de monedas distintas no se suman. */
  presupuesto: ResumenPresupuesto[];
  certificacionesEnCurso: ResumenCertificacion[];
}

export function calcularResumen(obras: Obra[]): ResumenObras {
  const activas = obras.filter((obra) => obra.etapa === 'ejecucion' || obra.etapa === 'certificacion');
  const contar = (estado: ObraEstado) => obras.filter((obra) => obra.estado === estado).length;

  const porMoneda = new Map<string, { total: bigint; ejercido: bigint }>();
  for (const obra of obras) {
    if (obra.etapa === 'propuesta') continue;
    const acc = porMoneda.get(obra.presupuesto.moneda) ?? { total: 0n, ejercido: 0n };
    acc.total += montoACentavos(obra.presupuesto.total);
    acc.ejercido += montoACentavos(obra.presupuesto.ejercido);
    porMoneda.set(obra.presupuesto.moneda, acc);
  }

  return {
    total: obras.length,
    activas: activas.length,
    propuestas: contar('propuesta'),
    retrasadas: contar('retrasada'),
    certificando: contar('certificando'),
    completadas: contar('completada'),
    avancePromedio: calcularAvance(activas),
    impactoMedido: sumarImpacto(obras.map((obra) => obra.impactoMedido)),
    presupuesto: [...porMoneda.entries()].map(([moneda, { total, ejercido }]) => {
      const totalMonto = centavosAMonto(total);
      const ejercidoMonto = centavosAMonto(ejercido);
      return { moneda, total: totalMonto, ejercido: ejercidoMonto, porcentajeEjercido: porcentajeMonto(ejercidoMonto, totalMonto) };
    }),
    certificacionesEnCurso: obras
      .filter((obra) => obra.certificacion && obra.certificacion.estado !== 'obtenida' && obra.etapa !== 'propuesta')
      .map((obra) => ({
        obraId: obra.id,
        obraNombre: obra.nombre,
        tipo: obra.certificacion!.tipo,
        nivelObjetivo: obra.certificacion!.nivelObjetivo,
        estado: obra.certificacion!.estado,
      })),
  };
}
