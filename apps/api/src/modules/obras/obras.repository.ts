import { Decimal128, type Db, type Filter, type UpdateFilter } from 'mongodb';
import {
  calcularAvance, derivarEstado, hoyISO, sumarImpacto,
  type Certificacion, type Decision, type Fase, type ImpactoEstimado, type Material, type Medicion, type Obra, type ObraEtapa,
} from '@erp/domain';
import { TenantRepository, type TenantScopedDocument } from '../../core/repository';

export const OBRAS_COLLECTION = 'obras';

export interface PresupuestoDocument { moneda: string; total: Decimal128; ejercido: Decimal128 }
export interface DecisionDocument extends Omit<Decision, 'fecha'> { fecha: Date }
export interface MedicionDocument extends Omit<Medicion, 'registradoEn'> { registradoEn: Date }

export interface ObraDocument extends TenantScopedDocument {
  nombre: string;
  cliente: string;
  ubicacion: string;
  alcance: string;
  etapa: ObraEtapa;
  presupuesto: PresupuestoDocument;
  certificacion: Certificacion | null;
  impactoEstimado: ImpactoEstimado;
  materiales: Material[];
  fases: Fase[];
  mediciones: MedicionDocument[];
  decisiones: DecisionDocument[];
}

export function toDecimal(monto: string): Decimal128 {
  return Decimal128.fromString(monto);
}

/** Normaliza un Decimal128 a cadena con 2 decimales ("1500" → "1500.00"). */
function fromDecimal(value: Decimal128): string {
  const [enteros, decimales = ''] = value.toString().split('.');
  return `${enteros}.${decimales.padEnd(2, '0').slice(0, 2)}`;
}

/** Documento persistido → JSON de la API, con estado y avance derivados a la fecha de hoy. */
export function toObra(document: ObraDocument, hoy: string = hoyISO()): Obra {
  return {
    id: document._id,
    tenantId: document.tenantId,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    nombre: document.nombre,
    cliente: document.cliente,
    ubicacion: document.ubicacion,
    alcance: document.alcance,
    etapa: document.etapa,
    estado: derivarEstado(document.etapa, document.fases, hoy),
    avance: calcularAvance(document.fases),
    presupuesto: {
      moneda: document.presupuesto.moneda,
      total: fromDecimal(document.presupuesto.total),
      ejercido: fromDecimal(document.presupuesto.ejercido),
    },
    certificacion: document.certificacion,
    impactoEstimado: document.impactoEstimado,
    impactoMedido: sumarImpacto(document.mediciones),
    materiales: document.materiales,
    fases: document.fases,
    mediciones: document.mediciones.map((m) => ({ ...m, registradoEn: m.registradoEn.toISOString() })),
    decisiones: document.decisiones.map((d) => ({ ...d, fecha: d.fecha.toISOString() })),
  };
}

export class ObrasRepository extends TenantRepository<ObraDocument> {
  async search(tenantId: string, q: string | undefined, limit = 500): Promise<ObraDocument[]> {
    const filter: Filter<ObraDocument> = {};
    if (q) {
      const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ nombre: pattern }, { cliente: pattern }, { ubicacion: pattern }];
    }
    return (await this.collection.find(this.scoped(tenantId, filter)).sort({ updatedAt: -1 }).limit(limit).toArray()) as ObraDocument[];
  }

  /**
   * Cambia la etapa solo si sigue siendo `deEtapa` (evita que dos aprobaciones simultáneas
   * apliquen dos transiciones). Devuelve null si la obra ya cambió o no existe.
   */
  async transition(
    id: string, tenantId: string, deEtapa: ObraEtapa, set: Partial<ObraDocument>, decision: DecisionDocument,
  ): Promise<ObraDocument | null> {
    return (await this.collection.findOneAndUpdate(
      this.scoped(tenantId, { _id: id, etapa: deEtapa } as Filter<ObraDocument>),
      // El índice de firma heredado de `Document` impide que el driver tipe $push sobre arrays declarados.
      { $set: { ...set, updatedAt: new Date() }, $push: { decisiones: decision } } as unknown as UpdateFilter<ObraDocument>,
      { returnDocument: 'after' },
    )) as ObraDocument | null;
  }

  async addMedicion(id: string, tenantId: string, medicion: MedicionDocument): Promise<ObraDocument | null> {
    return (await this.collection.findOneAndUpdate(
      this.scoped(tenantId, { _id: id } as Filter<ObraDocument>),
      { $set: { updatedAt: new Date() }, $push: { mediciones: medicion } } as unknown as UpdateFilter<ObraDocument>,
      { returnDocument: 'after' },
    )) as ObraDocument | null;
  }
}

export function obrasRepository(db: Db): ObrasRepository {
  return new ObrasRepository(db.collection<ObraDocument>(OBRAS_COLLECTION));
}

export async function ensureObrasIndexes(db: Db): Promise<void> {
  await db.collection(OBRAS_COLLECTION).createIndexes([
    { key: { tenantId: 1, deletedAt: 1, updatedAt: -1 }, name: 'tenant_active_recent' },
  ]);
}
