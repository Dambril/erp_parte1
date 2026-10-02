import type { Collection, Db } from 'mongodb';
import { PROJECTS_COLLECTION, type ProjectDocument, type RequirementDocument } from '../projects/projects.repository';

export type RequirementChanges = Pick<RequirementDocument, 'status' | 'note' | 'updatedBy' | 'updatedAt'>;

/** Los requisitos de certificación viven dentro de la obra; aquí solo se actualiza uno por su código. */
export class CertificationsRepository {
  public constructor(private readonly collection: Collection<ProjectDocument>) {}

  /** Devuelve la obra actualizada, o `null` si la obra no existe o no tiene ese requisito. */
  async updateRequirement(projectId: string, tenantId: string, code: string, changes: RequirementChanges): Promise<ProjectDocument | null> {
    if (!tenantId) throw new Error('tenantId is required for repository queries');
    return this.collection.findOneAndUpdate(
      { _id: projectId, tenantId, deletedAt: null, 'certification.requirements.code': code },
      {
        $set: {
          'certification.requirements.$.status': changes.status,
          'certification.requirements.$.note': changes.note,
          'certification.requirements.$.updatedBy': changes.updatedBy,
          'certification.requirements.$.updatedAt': changes.updatedAt,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' },
    );
  }
}

export function certificationsRepository(db: Db): CertificationsRepository {
  return new CertificationsRepository(db.collection<ProjectDocument>(PROJECTS_COLLECTION));
}
