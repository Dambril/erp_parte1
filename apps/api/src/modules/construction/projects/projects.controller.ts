import type { Request, Response } from 'express';
import { PageQuerySchema, ProjectsQuerySchema, TransitionProjectSchema, UpdateProjectSchema } from '@erp/domain';
import { actorOf, IdParamSchema, ok } from '../construction.container';
import type { ProjectsService } from './projects.service';

export class ProjectsController {
  public constructor(private readonly service: () => ProjectsService) {}

  list = async (request: Request, response: Response) => {
    ok(response, await this.service().list(ProjectsQuerySchema.parse(request.query), actorOf(request)));
  };

  get = async (request: Request, response: Response) => {
    const { id } = IdParamSchema.parse(request.params);
    ok(response, await this.service().get(id, actorOf(request)));
  };

  update = async (request: Request, response: Response) => {
    const { id } = IdParamSchema.parse(request.params);
    ok(response, await this.service().update(id, UpdateProjectSchema.parse(request.body), actorOf(request)));
  };

  transition = async (request: Request, response: Response) => {
    const { id } = IdParamSchema.parse(request.params);
    const { to } = TransitionProjectSchema.parse(request.body);
    ok(response, await this.service().transition(id, to, actorOf(request)));
  };

  archive = async (request: Request, response: Response) => {
    const { id } = IdParamSchema.parse(request.params);
    ok(response, await this.service().archive(id, actorOf(request)));
  };

  unarchive = async (request: Request, response: Response) => {
    const { id } = IdParamSchema.parse(request.params);
    ok(response, await this.service().unarchive(id, actorOf(request)));
  };

  remove = async (request: Request, response: Response) => {
    const { id } = IdParamSchema.parse(request.params);
    await this.service().remove(id, actorOf(request));
    response.status(204).end();
  };

  activity = async (request: Request, response: Response) => {
    const { id } = IdParamSchema.parse(request.params);
    ok(response, await this.service().activity(id, PageQuerySchema.parse(request.query), actorOf(request)));
  };
}
