import type { ClientSession, Db, Decimal128, Filter, UpdateFilter } from 'mongodb';
import type { CertificationType, ImpactTargets, ProjectType, ProposalMaterial, ProposalStatus } from '@erp/domain';
import { TenantRepository, type Page, type PageRequest, type TenantScopedDocument } from '../../../core/repository';

export const PROPOSALS_COLLECTION = 'proposals';

export interface ProposalDocument extends TenantScopedDocument {
  folio: string;
  name: string;
  client: { name: string };
  location: string;
  type: ProjectType;
  scope: string;
  materials: ProposalMaterial[];
  /** Fechas `AAAA-MM-DD`. */
  estimatedStart: string | null;
  estimatedEnd: string | null;
  estimatedBudget: Decimal128;
  sustainability: { certification: CertificationType; level: string | null; targets: ImpactTargets };
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

export class ProposalsRepository extends TenantRepository<ProposalDocument> {
  /** Las enviadas más recientes primero; los borradores (sin `submittedAt`), por fecha de creación. */
  async search(tenantId: string, status: ProposalStatus | undefined, page: PageRequest): Promise<Page<ProposalDocument>> {
    return this.findPage(tenantId, status ? { status } : {}, page, { submittedAt: -1, createdAt: -1, _id: 1 });
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
  ]);
}
