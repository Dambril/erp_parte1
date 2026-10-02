import type { ClientSession, Db, Decimal128, Filter, UpdateFilter } from 'mongodb';
import type { CertificationType, ProjectType, ProposalMaterial, ProposalStatus, ProposalTargets } from '@erp/domain';
import { escapeRegex, TenantRepository, type Page, type PageRequest, type TenantScopedDocument } from '../../../core/repository';

export const PROPOSALS_COLLECTION = 'proposals';

/** Un borrador puede estar incompleto: lo que aún no se captura es `null`. Enviar a revisión exige todo. */
export interface ProposalDocument extends TenantScopedDocument {
  folio: string;
  name: string;
  client: { name: string } | null;
  location: string | null;
  type: ProjectType | null;
  scope: string | null;
  materials: ProposalMaterial[];
  /** Fechas `AAAA-MM-DD`. */
  estimatedStart: string | null;
  estimatedEnd: string | null;
  estimatedBudget: Decimal128 | null;
  sustainability: { certification: CertificationType | null; level: string | null; targets: ProposalTargets };
  status: ProposalStatus;
  submittedAt: Date | null;
  decidedAt: Date | null;
  decidedBy: string | null;
  rejectionReason: string | null;
  projectId: string | null;
  createdBy: string;
  deletedBy: string | null;
  custom: Record<string, unknown>;
}

export type ProposalDecision = Pick<ProposalDocument, 'status' | 'decidedAt' | 'decidedBy' | 'rejectionReason'>;

/** Lo que captura quien redacta la propuesta. */
export type ProposalContent = Pick<
  ProposalDocument,
  'name' | 'client' | 'location' | 'type' | 'scope' | 'materials' | 'estimatedStart' | 'estimatedEnd' | 'estimatedBudget'
  | 'sustainability' | 'custom'
>;

export interface ProposalSearch {
  status?: ProposalStatus;
  q?: string;
}

/** Estados desde los que una propuesta se puede eliminar. */
const DELETABLE: ProposalStatus[] = ['draft', 'rejected'];

export class ProposalsRepository extends TenantRepository<ProposalDocument> {
  /** Las enviadas más recientes primero; los borradores (sin `submittedAt`), por fecha de creación. */
  async search(tenantId: string, { status, q }: ProposalSearch, page: PageRequest): Promise<Page<ProposalDocument>> {
    const filter: Filter<ProposalDocument> = {};
    if (status) filter.status = status;
    if (q) {
      const pattern = { $regex: escapeRegex(q), $options: 'i' };
      filter.$or = [{ name: pattern }, { 'client.name': pattern }, { folio: pattern }];
    }
    return this.findPage(tenantId, filter, page, { submittedAt: -1, createdAt: -1, _id: 1 });
  }

  /** Cambia un estado por otro solo si la propuesta sigue en `from` (el estado va en el filtro). */
  private async changeFrom(
    id: string, tenantId: string, from: ProposalStatus, changes: Partial<ProposalDocument>, session?: ClientSession,
  ): Promise<ProposalDocument | null> {
    return (await this.collection.findOneAndUpdate(
      this.scoped(tenantId, { _id: id, status: from } as Filter<ProposalDocument>),
      { $set: { ...changes, updatedAt: new Date() } } as UpdateFilter<ProposalDocument>,
      { returnDocument: 'after', session },
    )) as ProposalDocument | null;
  }

  /** Solo un borrador se edita. Devuelve `null` si ya no lo es o no existe. */
  async updateDraft(id: string, tenantId: string, content: Partial<ProposalContent>, session?: ClientSession): Promise<ProposalDocument | null> {
    return this.changeFrom(id, tenantId, 'draft', content, session);
  }

  async submit(id: string, tenantId: string, session: ClientSession): Promise<ProposalDocument | null> {
    return this.changeFrom(id, tenantId, 'draft', { status: 'in_review', submittedAt: new Date() }, session);
  }

  /** Borrado lógico, solo desde borrador o rechazada. Devuelve `null` si no aplica. */
  async softDelete(id: string, tenantId: string, deletedBy: string, session: ClientSession): Promise<ProposalDocument | null> {
    const now = new Date();
    return (await this.collection.findOneAndUpdate(
      this.scoped(tenantId, { _id: id, status: { $in: DELETABLE } } as Filter<ProposalDocument>),
      { $set: { deletedAt: now, deletedBy, updatedAt: now } } as UpdateFilter<ProposalDocument>,
      { returnDocument: 'after', session },
    )) as ProposalDocument | null;
  }

  /** Saca la propuesta de la papelera con el estado que tenía. Devuelve `null` si no está eliminada. */
  async restore(id: string, tenantId: string, session: ClientSession): Promise<ProposalDocument | null> {
    return (await this.collection.findOneAndUpdate(
      this.scopedDeleted(tenantId, { _id: id } as Filter<ProposalDocument>),
      { $set: { deletedAt: null, deletedBy: null, updatedAt: new Date() } } as UpdateFilter<ProposalDocument>,
      { returnDocument: 'after', session },
    )) as ProposalDocument | null;
  }

  async findInReview(tenantId: string, limit: number): Promise<ProposalDocument[]> {
    return (await this.collection.find(this.scoped(tenantId, { status: 'in_review' }))
      .sort({ submittedAt: 1, _id: 1 }).limit(limit).toArray()) as ProposalDocument[];
  }

  /**
   * Registra la decisión solo si la propuesta sigue en `from`: el estado va en el filtro para que dos
   * decisiones simultáneas no se apliquen las dos. Devuelve `null` si ya cambió o no existe.
   */
  async decide(
    id: string, tenantId: string, from: ProposalStatus, decision: ProposalDecision, session?: ClientSession,
  ): Promise<ProposalDocument | null> {
    return (await this.collection.findOneAndUpdate(
      this.scoped(tenantId, { _id: id, status: from } as Filter<ProposalDocument>),
      { $set: { ...decision, updatedAt: new Date() } } as UpdateFilter<ProposalDocument>,
      { returnDocument: 'after', session },
    )) as ProposalDocument | null;
  }

  async linkProject(id: string, tenantId: string, projectId: string, session: ClientSession): Promise<ProposalDocument | null> {
    return (await this.collection.findOneAndUpdate(
      this.scoped(tenantId, { _id: id } as Filter<ProposalDocument>),
      { $set: { projectId, updatedAt: new Date() } } as UpdateFilter<ProposalDocument>,
      { returnDocument: 'after', session },
    )) as ProposalDocument | null;
  }
}

export function proposalsRepository(db: Db): ProposalsRepository {
  return new ProposalsRepository(db.collection<ProposalDocument>(PROPOSALS_COLLECTION));
}

export async function ensureProposalsIndexes(db: Db): Promise<void> {
  await db.collection(PROPOSALS_COLLECTION).createIndexes([
    { key: { tenantId: 1, status: 1 }, name: 'tenant_status' },
    { key: { tenantId: 1, folio: 1 }, name: 'tenant_folio_unique', unique: true },
    // Papelera: eliminadas del tenant, de la más reciente a la más antigua.
    { key: { tenantId: 1, deletedAt: -1 }, name: 'tenant_deleted' },
  ]);
}
