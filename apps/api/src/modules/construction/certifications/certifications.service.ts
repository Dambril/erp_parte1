import type { z } from 'zod';
import { REQUIREMENT_STATUS_LABEL, type CertificationRequirement, type UpdateRequirementSchema } from '@erp/domain';
import type { AuditTrailRepository } from '../../../core/audit';
import { HttpError } from '../../../core/http-error';
import type { RequestUser } from '../../../core/middlewares/auth';
import type { RealtimePublisher } from '../../../core/realtime';
import { toRequirement } from '../projects/projects.mapper';
import type { ProjectsRepository } from '../projects/projects.repository';
import { projectNotFound } from '../projects/projects.service';
import type { CertificationsRepository } from './certifications.repository';

export interface CertificationsDependencies {
  certifications: CertificationsRepository;
  projects: ProjectsRepository;
  audit: AuditTrailRepository;
  publish: RealtimePublisher;
  now: () => Date;
}

export class CertificationsService {
  public constructor(private readonly deps: CertificationsDependencies) {}

  async updateRequirement(
    projectId: string, code: string, input: z.output<typeof UpdateRequirementSchema>, actor: RequestUser,
  ): Promise<CertificationRequirement> {
    const { tenantId } = actor;
    const project = await this.deps.certifications.updateRequirement(projectId, tenantId, code, {
      ...input, updatedBy: actor.id, updatedAt: this.deps.now(),
    });
    if (!project) {
      if (!(await this.deps.projects.findById(projectId, tenantId))) throw projectNotFound();
      throw new HttpError(404, 'REQUIREMENT_NOT_FOUND', 'La obra no tiene ese requisito de certificación');
    }
    const requirement = project.certification.requirements.find((item) => item.code === code)!;
    await this.deps.audit.record({
      tenantId, actorId: actor.id, action: 'certification.requirement_updated', entityType: 'project', entityId: projectId,
      summary: `Marcó el requisito "${requirement.title}" como ${REQUIREMENT_STATUS_LABEL[requirement.status].toLowerCase()}`,
    });
    this.deps.publish(tenantId, { type: 'construction.changed', entity: 'project', id: projectId });
    return toRequirement(requirement);
  }
}
