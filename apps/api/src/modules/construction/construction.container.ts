import type { Request, Response } from 'express';
import type { Db } from 'mongodb';
import { z } from 'zod';
import { auditTrailRepository } from '../../core/audit';
import { countersRepository } from '../../core/counters';
import type { RequestUser } from '../../core/middlewares/auth';
import type { RealtimePublisher } from '../../core/realtime';
import { identityRepositories } from '../identity/identity.repository';
import { budgetMovementsRepository, ensureBudgetIndexes } from './budget/budget.repository';
import { BudgetService } from './budget/budget.service';
import { certificationsRepository } from './certifications/certifications.repository';
import { CertificationsService } from './certifications/certifications.service';
import { DashboardService } from './dashboard.service';
import { ensureProjectsIndexes, projectsRepository } from './projects/projects.repository';
import { ProjectsService } from './projects/projects.service';
import { ensureProposalsIndexes, proposalsRepository } from './proposals/proposals.repository';
import { ProposalsService } from './proposals/proposals.service';

export function constructionRepositories(db: Db) {
  return {
    proposals: proposalsRepository(db),
    projects: projectsRepository(db),
    budget: budgetMovementsRepository(db),
    certifications: certificationsRepository(db),
    counters: countersRepository(db),
    audit: auditTrailRepository(db),
  };
}
export type ConstructionRepositories = ReturnType<typeof constructionRepositories>;

/** Servicios del módulo sobre una base concreta (rutas y pruebas). `now` permite fijar la fecha al calcular retrasos. */
export function constructionServices(db: Db, publish: RealtimePublisher, now: () => Date = () => new Date()) {
  const repositories = constructionRepositories(db);
  const { users } = identityRepositories(db);
  return {
    proposals: new ProposalsService({ ...repositories, publish }),
    projects: new ProjectsService({ ...repositories, users, publish, now }),
    budget: new BudgetService({ ...repositories, publish }),
    certifications: new CertificationsService({ ...repositories, publish, now }),
    dashboard: new DashboardService({ ...repositories, now }),
  };
}
export type ConstructionServices = ReturnType<typeof constructionServices>;

export async function ensureConstructionIndexes(db: Db): Promise<void> {
  await ensureProposalsIndexes(db);
  await ensureProjectsIndexes(db);
  await ensureBudgetIndexes(db);
}

// ── Utilidades de los controllers ──────────────────────────────────

export const IdParamSchema = z.object({ id: z.string().uuid() });

export function ok<T>(response: Response, data: T, status = 200): void {
  response.status(status).json({ success: true, data, timestamp: new Date().toISOString() });
}

/** Las rutas del módulo pasan por `requireAuth`: `user` existe. */
export function actorOf(request: Request): RequestUser {
  return request.user!;
}
