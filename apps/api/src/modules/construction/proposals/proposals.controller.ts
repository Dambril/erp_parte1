import type { Request, Response } from 'express';
import { ProposalsQuerySchema, RejectProposalSchema } from '@erp/domain';
import { actorOf, IdParamSchema, ok } from '../construction.container';
import type { ProposalsService } from './proposals.service';

export class ProposalsController {
  public constructor(private readonly service: () => ProposalsService) {}

  list = async (request: Request, response: Response) => {
    ok(response, await this.service().list(ProposalsQuerySchema.parse(request.query), actorOf(request)));
  };

  get = async (request: Request, response: Response) => {
    const { id } = IdParamSchema.parse(request.params);
    ok(response, await this.service().get(id, actorOf(request)));
  };

  approve = async (request: Request, response: Response) => {
    const { id } = IdParamSchema.parse(request.params);
    ok(response, await this.service().approve(id, actorOf(request)));
  };

  reject = async (request: Request, response: Response) => {
    const { id } = IdParamSchema.parse(request.params);
    const { reason } = RejectProposalSchema.parse(request.body);
    ok(response, await this.service().reject(id, reason, actorOf(request)));
  };
}
