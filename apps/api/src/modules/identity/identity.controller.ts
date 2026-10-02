import type { Request, Response } from 'express';
import {
  AcceptInvitationRequestSchema, CreateUserRequestSchema, ForgotPasswordRequestSchema, LoginRequestSchema, RefreshRequestSchema,
  ResetPasswordRequestSchema,
} from '@erp/domain';
import type { IdentityService } from './identity.service';

function ok<T>(response: Response, data: T, status = 200): void {
  response.status(status).json({ success: true, data, timestamp: new Date().toISOString() });
}

/** Las rutas que llegan aquí ya pasaron por requireAuth, así que `user` y `tenant` existen. */
function context(request: Request) {
  return { user: request.user!, tenantId: request.tenant!.tenantId };
}

/** Mismo cuerpo exista o no el correo. */
export const FORGOT_PASSWORD_MESSAGE = 'Si el correo pertenece a una cuenta, te enviaremos un enlace para crear una contraseña nueva.';

export class IdentityController {
  public constructor(private readonly service: () => IdentityService) {}

  login = async (request: Request, response: Response) => {
    ok(response, await this.service().login(LoginRequestSchema.parse(request.body)));
  };

  refresh = async (request: Request, response: Response) => {
    const { refreshToken } = RefreshRequestSchema.parse(request.body);
    ok(response, await this.service().refresh(refreshToken));
  };

  logout = async (request: Request, response: Response) => {
    await this.service().logout(context(request).user);
    response.status(204).end();
  };

  forgotPassword = async (request: Request, response: Response) => {
    await this.service().forgotPassword(ForgotPasswordRequestSchema.parse(request.body).email);
    ok(response, { message: FORGOT_PASSWORD_MESSAGE }, 202);
  };

  resetPassword = async (request: Request, response: Response) => {
    await this.service().resetPassword(ResetPasswordRequestSchema.parse(request.body));
    response.status(204).end();
  };

  acceptInvitation = async (request: Request, response: Response) => {
    await this.service().acceptInvitation(AcceptInvitationRequestSchema.parse(request.body));
    response.status(204).end();
  };

  me = async (request: Request, response: Response) => {
    const { user, tenantId } = context(request);
    ok(response, await this.service().getMe(user.id, tenantId));
  };

  listUsers = async (request: Request, response: Response) => {
    ok(response, await this.service().listUsers(context(request).tenantId));
  };

  createUser = async (request: Request, response: Response) => {
    const { user, tenantId } = context(request);
    ok(response, await this.service().createUser(CreateUserRequestSchema.parse(request.body), tenantId, user), 201);
  };
}
