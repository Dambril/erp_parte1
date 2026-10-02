import type { z } from 'zod';
import type { Filter } from 'mongodb';
import { roleHasScopedPermission, type Paginated, type TrashItem, type TrashQuerySchema } from '@erp/domain';
import type { RequestUser } from '../../../core/middlewares/auth';
import type { UserDocument, UsersRepository } from '../../identity/identity.repository';
import type { TrashKind, TrashRepository } from './trash.repository';

export interface TrashDependencies {
  trash: TrashRepository;
  users: UsersRepository;
}

export class TrashService {
  public constructor(private readonly deps: TrashDependencies) {}

  /** Cada quien ve en la papelera solo lo que puede restaurar. */
  async list(query: z.output<typeof TrashQuerySchema>, actor: RequestUser): Promise<Paginated<TrashItem>> {
    const kinds: TrashKind[] = [];
    if (roleHasScopedPermission(actor.role, 'construction.projects:restore')) kinds.push('project');
    if (roleHasScopedPermission(actor.role, 'construction.proposals:restore')) kinds.push('proposal');

    const page = await this.deps.trash.findPage(actor.tenantId, kinds, query);
    const userIds = [...new Set(page.items.flatMap((row) => (row.deletedBy ? [row.deletedBy] : [])))];
    const users = await this.deps.users.findMany(actor.tenantId, { _id: { $in: userIds } } as Filter<UserDocument>, userIds.length || 1);
    const names = new Map(users.map((user) => [user._id, user.name]));
    return {
      ...page,
      items: page.items.map((row) => ({
        id: row._id,
        kind: row.kind,
        folio: row.folio,
        name: row.name,
        deletedAt: row.deletedAt.toISOString(),
        deletedBy: row.deletedBy ? { id: row.deletedBy, name: names.get(row.deletedBy) ?? 'Usuario eliminado' } : null,
      })),
    };
  }
}
