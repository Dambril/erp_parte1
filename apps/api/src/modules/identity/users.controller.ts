import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  ChangePasswordRequestSchema, ChangeRoleRequestSchema, InviteUserRequestSchema, UpdateProfileRequestSchema, UsersQuerySchema,
} from '@erp/domain';
import type { UsersService } from './users.service';

const IdParamSchema = z.object({ id: z.string().min(1).max(64) });

function ok<T>(response: Response, data: T, status = 200): void {
  response.status(status).json({ success: true, data, timestamp: new Date().toISOString() });
}

export class UsersController {
  public constructor(private readonly service: () => UsersService) {}

  list = async (request: Request, response: Response) => {
    ok(response, await this.service().list(UsersQuerySchema.parse(request.query), request.user!));
  };

  invite = async (request: Request, response: Response) => {
    ok(response, await this.service().invite(InviteUserRequestSchema.parse(request.body), request.user!), 201);
  };

  resendInvitation = async (request: Request, response: Response) => {
    const { id } = IdParamSchema.parse(request.params);
    ok(response, await this.service().resendInvitation(id, request.user!));
  };

  changeRole = async (request: Request, response: Response) => {
    const { id } = IdParamSchema.parse(request.params);
    const { role } = ChangeRoleRequestSchema.parse(request.body);
    ok(response, await this.service().changeRole(id, role, request.user!));
  };

  deactivate = async (request: Request, response: Response) => {
    const { id } = IdParamSchema.parse(request.params);
    ok(response, await this.service().deactivate(id, request.user!));
  };

  reactivate = async (request: Request, response: Response) => {
    const { id } = IdParamSchema.parse(request.params);
    ok(response, await this.service().reactivate(id, request.user!));
  };

  updateProfile = async (request: Request, response: Response) => {
    const { name } = UpdateProfileRequestSchema.parse(request.body);
    ok(response, await this.service().updateProfile(name, request.user!));
  };

  changePassword = async (request: Request, response: Response) => {
    await this.service().changePassword(ChangePasswordRequestSchema.parse(request.body), request.user!);
    response.status(204).end();
  };
}
