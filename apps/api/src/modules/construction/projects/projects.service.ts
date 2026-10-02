import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import {
  canTransitionProject, PROJECT_STATUS_LABEL, roleHasScopedPermission,
  type ActivityEntry, type PageQuerySchema, type Paginated, type ProjectDetail, type ProjectDetailWithAmounts, type ProjectListItem,
  type ProjectsQuerySchema, type ProjectStatus, type UpdateProjectSchema,
} from '@erp/domain';
import type { Filter } from 'mongodb';
import { withTransaction } from '../../../config/database';
import type { AuditTrailRepository } from '../../../core/audit';
import { HttpError } from '../../../core/http-error';
import type { RequestUser } from '../../../core/middlewares/auth';
import type { RealtimePublisher } from '../../../core/realtime';
import type { UserDocument, UsersRepository } from '../../identity/identity.repository';
import type { BudgetMovementsRepository } from '../budget/budget.repository';
import { toProjectDetail, toProjectListItem } from './projects.mapper';
import type { ProjectDocument, ProjectsRepository } from './projects.repository';

export const projectNotFound = () => new HttpError(404, 'PROJECT_NOT_FOUND', 'La obra no existe');

type AnyProjectDetail = ProjectDetail | ProjectDetailWithAmounts;

export interface ProjectsDependencies {
  projects: ProjectsRepository;
  budget: BudgetMovementsRepository;
  users: UsersRepository;
  audit: AuditTrailRepository;
  publish: RealtimePublisher;
  now: () => Date;
}

export class ProjectsService {
  public constructor(private readonly deps: ProjectsDependencies) {}

  async list(query: z.output<typeof ProjectsQuerySchema>, actor: RequestUser): Promise<Paginated<ProjectListItem>> {
    if (query.archived && !roleHasScopedPermission(actor.role, 'construction.projects:archive')) {
      throw new HttpError(403, 'FORBIDDEN', `Role "${actor.role}" lacks permission construction.projects:archive`);
    }
    const { page, pageSize, ...search } = query;
    const result = await this.deps.projects.search(actor.tenantId, search, { page, pageSize });
    const now = this.deps.now();
    return { ...result, items: result.items.map((project) => toProjectListItem(project, now)) };
  }

  async get(id: string, actor: RequestUser): Promise<AnyProjectDetail> {
    const project = await this.deps.projects.findById(id, actor.tenantId);
    if (!project) throw projectNotFound();
    return this.detail(project, actor);
  }

  async update(id: string, input: z.output<typeof UpdateProjectSchema>, actor: RequestUser): Promise<AnyProjectDetail> {
    const { phases, ...rest } = input;
    const project = await this.deps.projects.update(id, actor.tenantId, {
      ...rest,
      ...(phases ? { phases: phases.map((phase) => ({ ...phase, key: phase.key ?? randomUUID() })) } : {}),
    });
    if (!project) throw projectNotFound();
    return this.afterChange(project, actor, 'project.updated', 'Actualizó los datos de la obra');
  }

  async transition(id: string, to: ProjectStatus, actor: RequestUser): Promise<AnyProjectDetail> {
    const current = await this.deps.projects.findById(id, actor.tenantId);
    if (!current) throw projectNotFound();
    const invalid = () => new HttpError(
      409, 'INVALID_TRANSITION', `Una obra en ${PROJECT_STATUS_LABEL[current.status]} no puede pasar a ${PROJECT_STATUS_LABEL[to]}`,
    );
    if (!canTransitionProject(current.status, to)) throw invalid();
    // El estado va en el filtro: si alguien la movió entre la lectura y la escritura, no se aplica.
    const project = await this.deps.projects.transition(id, actor.tenantId, current.status, to);
    if (!project) throw invalid();
    return this.afterChange(
      project, actor, 'project.status_changed',
      `Cambió el estado de ${PROJECT_STATUS_LABEL[current.status]} a ${PROJECT_STATUS_LABEL[to]}`,
    );
  }

  async archive(id: string, actor: RequestUser): Promise<AnyProjectDetail> {
    const project = await this.deps.projects.setArchived(id, actor.tenantId, actor.id);
    if (!project) throw await this.archiveConflict(id, actor, 'PROJECT_ALREADY_ARCHIVED', 'La obra ya está archivada');
    return this.afterChange(project, actor, 'project.archived', 'Archivó la obra');
  }

  async unarchive(id: string, actor: RequestUser): Promise<AnyProjectDetail> {
    const project = await this.deps.projects.setArchived(id, actor.tenantId, null);
    if (!project) throw await this.archiveConflict(id, actor, 'PROJECT_NOT_ARCHIVED', 'La obra no está archivada');
    return this.afterChange(project, actor, 'project.unarchived', 'Restauró la obra desde Archivadas');
  }

  /** Borrado lógico, solo si el presupuesto no tiene más que el movimiento inicial. */
  async remove(id: string, actor: RequestUser): Promise<void> {
    await withTransaction(async (session) => {
      // `touch` toma el candado de la obra: un ajuste simultáneo choca aquí y no se cuela después de la comprobación.
      if (!(await this.deps.projects.touch(id, actor.tenantId, session))) throw projectNotFound();
      const totals = await this.deps.budget.totals(actor.tenantId, id, session);
      if (totals.otherMovements > 0) {
        throw new HttpError(409, 'PROJECT_HAS_MOVEMENTS', 'No se puede eliminar porque tiene movimientos de presupuesto. Archívala en su lugar.');
      }
      await this.deps.projects.softDelete(id, actor.tenantId, actor.id, session);
      await this.deps.audit.record({
        tenantId: actor.tenantId, actorId: actor.id, action: 'project.deleted', entityType: 'project', entityId: id,
        summary: 'Eliminó la obra',
      }, session);
    });
    this.deps.publish(actor.tenantId, { type: 'construction.changed', entity: 'project', id });
  }

  async activity(id: string, query: z.output<typeof PageQuerySchema>, actor: RequestUser): Promise<Paginated<ActivityEntry>> {
    if (!(await this.deps.projects.findById(id, actor.tenantId))) throw projectNotFound();
    const page = await this.deps.audit.findPage(actor.tenantId, 'project', id, query);
    const actorIds = [...new Set(page.items.map((entry) => entry.actorId))];
    const users = await this.deps.users.findMany(actor.tenantId, { _id: { $in: actorIds } } as Filter<UserDocument>, actorIds.length || 1);
    const names = new Map(users.map((user) => [user._id, user.name]));
    return {
      ...page,
      items: page.items.map((entry) => ({
        id: entry._id,
        action: entry.action,
        summary: entry.summary,
        actorId: entry.actorId,
        actorName: names.get(entry.actorId) ?? 'Usuario eliminado',
        at: entry.at.toISOString(),
      })),
    };
  }

  /** Arma el detalle con o sin montos según el permiso de quien lo pide. */
  async detail(project: ProjectDocument, actor: RequestUser): Promise<AnyProjectDetail> {
    const totals = await this.deps.budget.totals(actor.tenantId, project._id);
    return toProjectDetail(project, totals, this.deps.now(), roleHasScopedPermission(actor.role, 'construction.budget:read_amounts'));
  }

  private async archiveConflict(id: string, actor: RequestUser, code: string, message: string): Promise<HttpError> {
    return (await this.deps.projects.findById(id, actor.tenantId)) ? new HttpError(409, code, message) : projectNotFound();
  }

  private async afterChange(project: ProjectDocument, actor: RequestUser, action: string, summary: string): Promise<AnyProjectDetail> {
    await this.deps.audit.record({
      tenantId: actor.tenantId, actorId: actor.id, action, entityType: 'project', entityId: project._id, summary,
    });
    this.deps.publish(actor.tenantId, { type: 'construction.changed', entity: 'project', id: project._id });
    return this.detail(project, actor);
  }
}
