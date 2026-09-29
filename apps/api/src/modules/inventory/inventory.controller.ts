import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  CreateLotSchema, CreateMovementSchema, CreateTransferSchema, InventorySettingsSchema, KardexQuerySchema,
  LotQuerySchema, ReverseMovementSchema, StockQuerySchema,
} from '@erp/domain';
import type { InventoryContext, InventoryService } from './inventory.service';

const IdParamSchema = z.object({ id: z.string().uuid() });
const ProductParamSchema = z.object({ productId: z.string().uuid() });

function ok<T>(response: Response, data: T, status = 200): void {
  response.status(status).json({ success: true, data, timestamp: new Date().toISOString() });
}

/** Las rutas que llegan aquí ya pasaron por requireAuth, así que `user` y `tenant` existen. */
function context(request: Request): InventoryContext {
  return { tenantId: request.tenant!.tenantId, userId: request.user!.id };
}

export class InventoryController {
  public constructor(private readonly service: () => InventoryService) {}

  createMovement = async (request: Request, response: Response) => {
    ok(response, await this.service().recordMovement(CreateMovementSchema.parse(request.body), context(request)), 201);
  };

  getMovement = async (request: Request, response: Response) => {
    const { id } = IdParamSchema.parse(request.params);
    ok(response, await this.service().getMovement(id, context(request).tenantId));
  };

  reverseMovement = async (request: Request, response: Response) => {
    const { id } = IdParamSchema.parse(request.params);
    const { reason } = ReverseMovementSchema.parse(request.body ?? {});
    ok(response, await this.service().reverse(id, reason, context(request)), 201);
  };

  createTransfer = async (request: Request, response: Response) => {
    ok(response, await this.service().transfer(CreateTransferSchema.parse(request.body), context(request)), 201);
  };

  stock = async (request: Request, response: Response) => {
    ok(response, await this.service().stock(StockQuerySchema.parse(request.query), context(request).tenantId));
  };

  kardex = async (request: Request, response: Response) => {
    const { productId } = ProductParamSchema.parse(request.params);
    ok(response, await this.service().kardex(productId, KardexQuerySchema.parse(request.query), context(request).tenantId));
  };

  listLots = async (request: Request, response: Response) => {
    ok(response, await this.service().listLots(LotQuerySchema.parse(request.query), context(request).tenantId));
  };

  createLot = async (request: Request, response: Response) => {
    ok(response, await this.service().createLot(CreateLotSchema.parse(request.body), context(request).tenantId), 201);
  };

  getSettings = async (request: Request, response: Response) => {
    ok(response, await this.service().getSettings(context(request).tenantId));
  };

  updateSettings = async (request: Request, response: Response) => {
    ok(response, await this.service().updateSettings(InventorySettingsSchema.parse(request.body), context(request)));
  };

  reconciliation = async (request: Request, response: Response) => {
    ok(response, await this.service().reconcile(context(request).tenantId));
  };
}
