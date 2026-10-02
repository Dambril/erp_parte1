import type { Request, Response } from 'express';
import { z } from 'zod';
import { UpdateRequirementSchema } from '@erp/domain';
import { actorOf, IdParamSchema, ok } from '../construction.container';
import type { CertificationsService } from './certifications.service';

const ParamsSchema = IdParamSchema.extend({ code: z.string().trim().min(1).max(64) });

/** Montado en `/projects/:id/certification`: `:id` es la obra. */
export class CertificationsController {
  public constructor(private readonly service: () => CertificationsService) {}

  updateRequirement = async (request: Request, response: Response) => {
    const { id, code } = ParamsSchema.parse(request.params);
    ok(response, await this.service().updateRequirement(id, code, UpdateRequirementSchema.parse(request.body), actorOf(request)));
  };
}
