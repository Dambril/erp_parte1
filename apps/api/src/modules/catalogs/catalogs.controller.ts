import type { Request, Response } from 'express';
import { z, type ZodTypeAny } from 'zod';
import {
  CurrencyInputSchema, CurrencyUpdateSchema, PaginationQuerySchema, PartyInputSchema, PartyUpdateSchema,
  ProductCategoryInputSchema, ProductCategoryUpdateSchema, ProductInputSchema, ProductUpdateSchema,
  TaxInputSchema, TaxUpdateSchema, UnitInputSchema, UnitUpdateSchema, WarehouseInputSchema, WarehouseUpdateSchema,
} from '@erp/domain';
import type { CatalogEntity } from './catalogs.repository';
import type { ActionContext, CatalogsService } from './catalogs.service';

const SCHEMAS: Record<CatalogEntity, { create: ZodTypeAny; update: ZodTypeAny }> = {
  unit: { create: UnitInputSchema, update: UnitUpdateSchema },
  tax: { create: TaxInputSchema, update: TaxUpdateSchema },
  currency: { create: CurrencyInputSchema, update: CurrencyUpdateSchema },
  category: { create: ProductCategoryInputSchema, update: ProductCategoryUpdateSchema },
  product: { create: ProductInputSchema, update: ProductUpdateSchema },
  customer: { create: PartyInputSchema, update: PartyUpdateSchema },
  supplier: { create: PartyInputSchema, update: PartyUpdateSchema },
  warehouse: { create: WarehouseInputSchema, update: WarehouseUpdateSchema },
};

const IdParamSchema = z.object({ id: z.string().uuid() });

function ok<T>(response: Response, data: T, status = 200): void {
  response.status(status).json({ success: true, data, timestamp: new Date().toISOString() });
}

/** Las rutas que llegan aquí ya pasaron por requireAuth, así que `user` y `tenant` existen. */
function context(request: Request): ActionContext {
  return { tenantId: request.tenant!.tenantId, actorId: request.user!.id };
}

/** Un controlador por entidad de catálogo; todas comparten el mismo contrato REST. */
export class CatalogsController {
  public constructor(private readonly entity: CatalogEntity, private readonly service: () => CatalogsService) {}

  list = async (request: Request, response: Response) => {
    ok(response, await this.service().list(this.entity, context(request).tenantId, PaginationQuerySchema.parse(request.query)));
  };

  get = async (request: Request, response: Response) => {
    const { id } = IdParamSchema.parse(request.params);
    ok(response, await this.service().get(this.entity, id, context(request).tenantId));
  };

  create = async (request: Request, response: Response) => {
    const input = SCHEMAS[this.entity].create.parse(request.body);
    ok(response, await this.service().create(this.entity, input, context(request)), 201);
  };

  update = async (request: Request, response: Response) => {
    const { id } = IdParamSchema.parse(request.params);
    const input = SCHEMAS[this.entity].update.parse(request.body);
    ok(response, await this.service().update(this.entity, id, input, context(request)));
  };

  remove = async (request: Request, response: Response) => {
    const { id } = IdParamSchema.parse(request.params);
    await this.service().remove(this.entity, id, context(request));
    response.status(204).end();
  };
}
