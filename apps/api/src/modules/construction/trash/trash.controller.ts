import type { Request, Response } from 'express';
import { TrashQuerySchema } from '@erp/domain';
import { actorOf, ok } from '../construction.container';
import type { TrashService } from './trash.service';

export class TrashController {
  public constructor(private readonly service: () => TrashService) {}

  list = async (request: Request, response: Response) => {
    ok(response, await this.service().list(TrashQuerySchema.parse(request.query), actorOf(request)));
  };
}
