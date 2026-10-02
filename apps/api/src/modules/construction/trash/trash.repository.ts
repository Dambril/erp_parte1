import type { Db, Document } from 'mongodb';
import type { TrashItem } from '@erp/domain';
import type { Page, PageRequest } from '../../../core/repository';
import { PROJECTS_COLLECTION } from '../projects/projects.repository';
import { PROPOSALS_COLLECTION } from '../proposals/proposals.repository';

export type TrashKind = TrashItem['kind'];

export interface TrashRow {
  _id: string;
  kind: TrashKind;
  folio: string;
  name: string;
  deletedAt: Date;
  deletedBy: string | null;
}

const COLLECTION: Record<TrashKind, string> = { project: PROJECTS_COLLECTION, proposal: PROPOSALS_COLLECTION };

/**
 * Lectura de lo eliminado (borrado lógico) de obras y propuestas. Es el único lugar, junto con los `restore`
 * de cada repository, que consulta documentos con `deletedAt`; siempre acotado al tenant.
 */
export class TrashRepository {
  public constructor(private readonly db: Db) {}

  /** Eliminados de un tipo, sin montos: solo lo que la papelera muestra. */
  private deleted(tenantId: string, kind: TrashKind): Document[] {
    return [
      { $match: { tenantId, deletedAt: { $ne: null } } },
      { $project: { kind: { $literal: kind }, folio: 1, name: 1, deletedAt: 1, deletedBy: 1 } },
    ];
  }

  /** Lo eliminado más reciente primero, mezclando los tipos pedidos. */
  async findPage(tenantId: string, kinds: readonly TrashKind[], { page, pageSize }: PageRequest): Promise<Page<TrashRow>> {
    if (!tenantId) throw new Error('tenantId is required for repository queries');
    const [first, ...rest] = kinds;
    if (!first) return { items: [], page, pageSize, total: 0 };

    const [result] = await this.db.collection(COLLECTION[first]).aggregate<{ items: TrashRow[]; total: { count: number }[] }>([
      ...this.deleted(tenantId, first),
      ...rest.map((kind) => ({ $unionWith: { coll: COLLECTION[kind], pipeline: this.deleted(tenantId, kind) } })),
      { $sort: { deletedAt: -1, _id: 1 } },
      { $facet: { items: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }], total: [{ $count: 'count' }] } },
    ]).toArray();
    return { items: result?.items ?? [], page, pageSize, total: result?.total[0]?.count ?? 0 };
  }
}

export function trashRepository(db: Db): TrashRepository {
  return new TrashRepository(db);
}
