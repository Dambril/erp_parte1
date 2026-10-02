import type { Request, Response } from 'express';
import { ProposalDraftSchema, ProposalsQuerySchema, RejectProposalSchema, UpdateProposalSchema } from '@erp/domain';
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

  create = async (request: Request, response: Response) => {
    ok(response, await this.service().create(ProposalDraftSchema.parse(request.body), actorOf(request)), 201);
  };

  update = async (request: Request, response: Response) => {
    const { id } = IdParamSchema.parse(request.params);
    ok(response, await this.service().update(id, UpdateProposalSchema.parse(request.body), actorOf(request)));
  };

  submit = async (request: Request, response: Response) => {
    const { id } = IdParamSchema.parse(request.params);
    ok(response, await this.service().submit(id, actorOf(request)));
  };

  remove = async (request: Request, response: Response) => {
    const { id } = IdParamSchema.parse(request.params);
    await this.service().remove(id, actorOf(request));
    response.status(204).end();
  };

  restore = async (request: Request, response: Response) => {
    const { id } = IdParamSchema.parse(request.params);
    ok(response, await this.service().restore(id, actorOf(request)));
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
