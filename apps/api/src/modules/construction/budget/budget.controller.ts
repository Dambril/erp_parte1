import type { Request, Response } from 'express';
import { CreateBudgetMovementSchema, PageQuerySchema } from '@erp/domain';
import { actorOf, IdParamSchema, ok } from '../construction.container';
import type { BudgetService } from './budget.service';

/** Montado en `/projects/:id/budget-movements`: `:id` es la obra. */
export class BudgetController {
  public constructor(private readonly service: () => BudgetService) {}

  list = async (request: Request, response: Response) => {
    const { id } = IdParamSchema.parse(request.params);
    ok(response, await this.service().list(id, PageQuerySchema.parse(request.query), actorOf(request)));
  };

  adjust = async (request: Request, response: Response) => {
    const { id } = IdParamSchema.parse(request.params);
    ok(response, await this.service().adjust(id, CreateBudgetMovementSchema.parse(request.body), actorOf(request)), 201);
  };
}
