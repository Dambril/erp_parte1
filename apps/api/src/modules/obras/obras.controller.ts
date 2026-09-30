import type { Request, Response } from 'express';
import {
  AprobarRequestSchema, CreateObraRequestSchema, MedicionRequestSchema, ObrasQuerySchema,
  SolicitarCambiosRequestSchema, UpdateObraRequestSchema,
} from '@erp/domain';
import type { ObrasService } from './obras.service';

function ok<T>(response: Response, data: T, status = 200): void {
  response.status(status).json({ success: true, data, timestamp: new Date().toISOString() });
}

/** Las rutas de obras pasan por requireAuth: `user` y `tenant` existen. */
function context(request: Request) {
  return { user: request.user!, tenantId: request.tenant!.tenantId };
}

export class ObrasController {
  public constructor(private readonly service: () => ObrasService) {}

  list = async (request: Request, response: Response) => {
    ok(response, await this.service().list(context(request).tenantId, ObrasQuerySchema.parse(request.query)));
  };

  resumen = async (request: Request, response: Response) => {
    ok(response, await this.service().resumen(context(request).tenantId));
  };

  get = async (request: Request, response: Response) => {
    ok(response, await this.service().get(request.params.id, context(request).tenantId));
  };

  create = async (request: Request, response: Response) => {
    ok(response, await this.service().create(CreateObraRequestSchema.parse(request.body), context(request).user), 201);
  };

  update = async (request: Request, response: Response) => {
    ok(response, await this.service().update(request.params.id, UpdateObraRequestSchema.parse(request.body), context(request).user));
  };

  aprobar = async (request: Request, response: Response) => {
    const { comentario } = AprobarRequestSchema.parse(request.body ?? {});
    ok(response, await this.service().aprobar(request.params.id, comentario, context(request).user));
  };

  solicitarCambios = async (request: Request, response: Response) => {
    const { comentario } = SolicitarCambiosRequestSchema.parse(request.body);
    ok(response, await this.service().solicitarCambios(request.params.id, comentario, context(request).user));
  };

  registrarMedicion = async (request: Request, response: Response) => {
    ok(response, await this.service().registrarMedicion(request.params.id, MedicionRequestSchema.parse(request.body), context(request).user), 201);
  };

  remove = async (request: Request, response: Response) => {
    await this.service().remove(request.params.id, context(request).user);
    response.status(204).end();
  };
}
