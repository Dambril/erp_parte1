import type { ClientSession, Db, Filter, UpdateFilter } from 'mongodb';
import type { CertificationType, ImpactTargets, ProjectPhase, ProjectStatus, ProjectType, RequirementStatus } from '@erp/domain';
import { escapeRegex, TenantRepository, type Page, type PageRequest, type TenantScopedDocument } from '../../../core/repository';

export const PROJECTS_COLLECTION = 'projects';

export interface RequirementDocument {
  code: string;
  title: string;
  status: RequirementStatus;
  note: string;
  updatedBy: string | null;
  updatedAt: Date | null;
}

/** La obra no guarda montos: su presupuesto se deriva de `budgetMovements`. */
export interface ProjectDocument extends TenantScopedDocument {
  folio: string;
  proposalId: string | null;
  name: string;
  client: { name: string };
  location: string;
  type: ProjectType;
  status: ProjectStatus;
  progressPct: number;
  /** Fechas planeadas `AAAA-MM-DD`. */
  phases: ProjectPhase[];
  certification: { type: CertificationType; level: string | null; requirements: RequirementDocument[] };
  impact: ImpactTargets;
  archivedAt: Date | null;
  archivedBy: string | null;
  deletedBy: string | null;
  custom: Record<string, unknown>;
}

export interface ProjectSearch {
  status?: ProjectStatus;
  q?: string;
  archived: boolean;
}

export interface ProjectKpis {
  activeProjects: number;
  averageProgressPct: number;
  co2TonsPerYear: number;
}

type ProjectChanges = Partial<Pick<ProjectDocument, 'name' | 'client' | 'location' | 'type' | 'progressPct' | 'phases' | 'custom'>>;

const set = (changes: object) => ({ $set: { ...changes, updatedAt: new Date() } }) as UpdateFilter<ProjectDocument>;

export class ProjectsRepository extends TenantRepository<ProjectDocument> {
  /** Obras vivas (ni eliminadas ni archivadas): la base de listados por defecto y KPIs. */
  private active(tenantId: string, filter: Filter<ProjectDocument> = {}): Filter<ProjectDocument> {
    return this.scoped(tenantId, { ...filter, archivedAt: null });
  }

  async search(tenantId: string, { status, q, archived }: ProjectSearch, page: PageRequest): Promise<Page<ProjectDocument>> {
    const filter: Filter<ProjectDocument> = { archivedAt: archived ? { $ne: null } : null };
    if (status) filter.status = status;
    if (q) {
      const pattern = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ name: pattern }, { 'client.name': pattern }];
    }
    return this.findPage(tenantId, filter, page, { folio: -1 });
  }

  async update(id: string, tenantId: string, changes: ProjectChanges): Promise<ProjectDocument | null> {
    return (await this.collection.findOneAndUpdate(
      this.scoped(tenantId, { _id: id } as Filter<ProjectDocument>), set(changes), { returnDocument: 'after' },
    )) as ProjectDocument | null;
  }

  /**
   * Marca la obra como modificada dentro de una transacción. Sirve de candado: un movimiento de presupuesto
   * y un borrado simultáneos chocan aquí (WriteConflict) y el que se reintenta ve el resultado del otro.
   */
  async touch(id: string, tenantId: string, session: ClientSession): Promise<ProjectDocument | null> {
    return (await this.collection.findOneAndUpdate(
      this.scoped(tenantId, { _id: id } as Filter<ProjectDocument>), set({}), { returnDocument: 'after', session },
    )) as ProjectDocument | null;
  }

  /** Cambia el estado solo si sigue siendo `from`. Devuelve `null` si ya cambió o no existe. */
  async transition(id: string, tenantId: string, from: ProjectStatus, to: ProjectStatus): Promise<ProjectDocument | null> {
    return (await this.collection.findOneAndUpdate(
      this.scoped(tenantId, { _id: id, status: from } as Filter<ProjectDocument>), set({ status: to }), { returnDocument: 'after' },
    )) as ProjectDocument | null;
  }

  /** Archiva o desarchiva. Devuelve `null` si ya estaba en ese estado o no existe. */
  async setArchived(id: string, tenantId: string, archivedBy: string | null): Promise<ProjectDocument | null> {
    const archiving = archivedBy !== null;
    return (await this.collection.findOneAndUpdate(
      this.scoped(tenantId, { _id: id, archivedAt: archiving ? null : { $ne: null } } as Filter<ProjectDocument>),
      set({ archivedAt: archiving ? new Date() : null, archivedBy }),
      { returnDocument: 'after' },
    )) as ProjectDocument | null;
  }

  /** Borrado lógico; los movimientos de presupuesto se conservan. */
  async softDelete(id: string, tenantId: string, deletedBy: string, session: ClientSession): Promise<boolean> {
    const result = await this.collection.updateOne(
      this.scoped(tenantId, { _id: id } as Filter<ProjectDocument>), set({ deletedAt: new Date(), deletedBy }), { session },
    );
    return result.modifiedCount === 1;
  }

  /** Saca la obra de la papelera tal como estaba (si estaba archivada, vuelve a Archivadas). `null` si no está eliminada. */
  async restore(id: string, tenantId: string): Promise<ProjectDocument | null> {
    return (await this.collection.findOneAndUpdate(
      this.scopedDeleted(tenantId, { _id: id } as Filter<ProjectDocument>),
      set({ deletedAt: null, deletedBy: null }),
      { returnDocument: 'after' },
    )) as ProjectDocument | null;
  }

  // ── Dashboard ───────────────────────────────────────────────────

  async kpis(tenantId: string): Promise<ProjectKpis> {
    const notCompleted = { $ne: ['$status', 'completed'] };
    const [row] = await this.collection.aggregate<ProjectKpis & { averageProgress: number | null }>([
      { $match: this.active(tenantId) },
      {
        $group: {
          _id: null,
          activeProjects: { $sum: { $cond: [notCompleted, 1, 0] } },
          // $avg ignora los `null`: solo promedian las obras que no han terminado.
          averageProgress: { $avg: { $cond: [notCompleted, '$progressPct', null] } },
          co2TonsPerYear: { $sum: '$impact.co2TonsPerYear' },
        },
      },
      { $addFields: { averageProgressPct: { $toInt: { $round: [{ $ifNull: ['$averageProgress', 0] }, 0] } } } },
    ]).toArray();
    return {
      activeProjects: row?.activeProjects ?? 0,
      averageProgressPct: row?.averageProgressPct ?? 0,
      co2TonsPerYear: row?.co2TonsPerYear ?? 0,
    };
  }

  async findInProgress(tenantId: string, limit: number): Promise<ProjectDocument[]> {
    return (await this.collection.find(this.active(tenantId, { status: 'in_progress' }))
      .sort({ updatedAt: -1 }).limit(limit).toArray()) as ProjectDocument[];
  }

  /** Obras sin terminar que buscan una certificación; primero las que ya están certificando. */
  async findCertifications(tenantId: string, limit: number): Promise<ProjectDocument[]> {
    return this.collection.aggregate<ProjectDocument>([
      { $match: this.active(tenantId, { status: { $ne: 'completed' }, 'certification.type': { $ne: 'none' } }) },
      { $addFields: { certifyingFirst: { $cond: [{ $eq: ['$status', 'certifying'] }, 0, 1] } } },
      { $sort: { certifyingFirst: 1, folio: 1 } },
      { $limit: limit },
      { $project: { certifyingFirst: 0 } },
    ]).toArray();
  }

  /** Obras cuya fase en curso (la primera `in_progress`) ya rebasó su fin planeado respecto a `today` (`AAAA-MM-DD`). */
  async findDelayed(tenantId: string, today: string, limit: number): Promise<ProjectDocument[]> {
    return this.collection.aggregate<ProjectDocument>([
      { $match: this.active(tenantId, { status: { $ne: 'completed' } }) },
      {
        $addFields: {
          currentPhase: {
            $arrayElemAt: [{ $filter: { input: '$phases', as: 'phase', cond: { $eq: ['$$phase.status', 'in_progress'] } } }, 0],
          },
        },
      },
      { $match: { 'currentPhase.plannedEnd': { $lt: today } } },
      { $sort: { 'currentPhase.plannedEnd': 1 } },
      { $limit: limit },
      { $project: { currentPhase: 0 } },
    ]).toArray();
  }

  async findCertifyingWithPending(tenantId: string, limit: number): Promise<ProjectDocument[]> {
    return (await this.collection.find(this.active(tenantId, {
      status: 'certifying', 'certification.requirements': { $elemMatch: { status: 'pending' } },
    })).sort({ folio: 1 }).limit(limit).toArray()) as ProjectDocument[];
  }
}

export function projectsRepository(db: Db): ProjectsRepository {
  return new ProjectsRepository(db.collection<ProjectDocument>(PROJECTS_COLLECTION));
}

export async function ensureProjectsIndexes(db: Db): Promise<void> {
  await db.collection(PROJECTS_COLLECTION).createIndexes([
    { key: { tenantId: 1, status: 1, archivedAt: 1, deletedAt: 1 }, name: 'tenant_status_archived_deleted' },
    { key: { tenantId: 1, folio: 1 }, name: 'tenant_folio_unique', unique: true },
    // Papelera: eliminadas del tenant, de la más reciente a la más antigua.
    { key: { tenantId: 1, deletedAt: -1 }, name: 'tenant_deleted' },
  ]);
}
