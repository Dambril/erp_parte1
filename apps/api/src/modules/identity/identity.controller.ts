import type { Request, Response } from 'express';
import {
  AcceptInvitationRequestSchema, ForgotPasswordRequestSchema, LoginRequestSchema, RefreshRequestSchema, ResetPasswordRequestSchema,
  type AuthSession, type CookieAuthSession,
} from '@erp/domain';
import type { ServerConfig } from '@erp/config';
import { HttpError } from '../../core/http-error';
import type { IdentityService } from './identity.service';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie, usesSessionCookie } from './session-cookie';

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
  public constructor(private readonly service: () => IdentityService, private readonly config: ServerConfig) {}

  login = async (request: Request, response: Response) => {
    this.respondSession(request, response, await this.service().login(LoginRequestSchema.parse(request.body)));
  };

  refresh = async (request: Request, response: Response) => {
    if (!usesSessionCookie(request)) {
      const { refreshToken } = RefreshRequestSchema.parse(request.body);
      return ok(response, await this.service().refresh(refreshToken));
    }
    const refreshToken = readRefreshCookie(request);
    if (!refreshToken) throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'La sesión no es válida o ya venció');
    try {
      this.respondSession(request, response, await this.service().refresh(refreshToken));
    } catch (error) {
      // La cookie ya no sirve: se borra para que el navegador no la siga enviando.
      clearRefreshCookie(response, this.config);
      throw error;
    }
  };

  logout = async (request: Request, response: Response) => {
    await this.service().logout(context(request).user);
    if (usesSessionCookie(request)) clearRefreshCookie(response, this.config);
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

  /** Con sesión por cookie el refresh token no aparece en el cuerpo: JavaScript nunca lo ve. */
  private respondSession(request: Request, response: Response, session: AuthSession): void {
    if (!usesSessionCookie(request)) return ok(response, session);
    setRefreshCookie(response, session.refreshToken, this.config);
    ok(response, { accessToken: session.accessToken, user: session.user } satisfies CookieAuthSession);
  }
}
