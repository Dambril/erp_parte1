import type { Request, Response } from 'express';
import { actorOf, ok } from './construction.container';
import type { DashboardService } from './dashboard.service';

export class DashboardController {
  public constructor(private readonly service: () => DashboardService) {}

  get = async (request: Request, response: Response) => {
    ok(response, await this.service().get(actorOf(request)));
  };
}
