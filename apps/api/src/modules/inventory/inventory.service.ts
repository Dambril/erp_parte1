import { randomUUID } from 'node:crypto';
import { MongoServerError, type ClientSession } from 'mongodb';
import type { z } from 'zod';
import type {
  CreateLotSchema, CreateMovementSchema, CreateTransferSchema, InventoryMovement, InventorySettings, Kardex, KardexQuerySchema,
  Lot, LotQuerySchema, MovementReference, MovementType, Paginated, ReconciliationDifference, ReconciliationReport,
  StockLevel, StockQuerySchema,
} from '@erp/domain';
import { withTransaction } from '../../config/database';
import type { AuditLogRepository } from '../../core/audit';
import { Decimal, decimalToString } from '../../core/decimal';
import { HttpError } from '../../core/http-error';
import type { CatalogRepositories, ProductDocument, WarehouseDocument } from '../catalogs/catalogs.repository';
import type {
  InventoryMovementDocument, InventoryRepositories, LotDocument, StockLevelDocument,
} from './inventory.repository';

/** Serie de folios de los movimientos de inventario. */
export const MOVEMENT_SERIES = 'MOV';

export interface InventoryContext {
  tenantId: string;
  userId: string;
}

export type TransactionRunner = <T>(work: (session: ClientSession) => Promise<T>) => Promise<T>;

type MovementInput = z.output<typeof CreateMovementSchema>;
type TransferInput = z.output<typeof CreateTransferSchema>;
type LotInput = z.output<typeof CreateLotSchema>;
type TrackingInput = { lotCode?: string; serialNumber?: string; lotExpiresAt?: string };

/** Un renglón de movimiento a aplicar dentro de una transacción. */
interface Leg {
  type: MovementType;
  product: ProductDocument;
  warehouseId: string;
  lotId: string | null;
  quantity: Decimal;
  unitCost: Decimal | null;
  reference: MovementReference | null;
  reversedMovementId: string | null;
  transferId: string | null;
}

const productNotFound = () => new HttpError(404, 'PRODUCT_NOT_FOUND', 'product not found');
const warehouseNotFound = () => new HttpError(404, 'WAREHOUSE_NOT_FOUND', 'warehouse not found');
const movementNotFound = () => new HttpError(404, 'MOVEMENT_NOT_FOUND', 'Inventory movement not found');
const alreadyReversed = () => new HttpError(409, 'MOVEMENT_ALREADY_REVERSED', 'This movement has already been reversed');

export function toApiMovement(movement: InventoryMovementDocument): InventoryMovement {
  return {
    id: movement._id,
    tenantId: movement.tenantId,
    folio: movement.folio,
    series: movement.series,
    number: movement.number,
    type: movement.type,
    productId: movement.productId,
    warehouseId: movement.warehouseId,
    lotId: movement.lotId,
    quantity: decimalToString(movement.quantity),
    unitCost: decimalToString(movement.unitCost),
    reference: movement.reference,
    reversedMovementId: movement.reversedMovementId,
    transferId: movement.transferId,
    userId: movement.userId,
    createdAt: movement.createdAt.toISOString(),
  };
}

function toApiStockLevel(level: StockLevelDocument): StockLevel {
  return {
    id: level._id,
    tenantId: level.tenantId,
    productId: level.productId,
    warehouseId: level.warehouseId,
    lotId: level.lotId,
    quantity: decimalToString(level.quantity),
    updatedAt: level.updatedAt.toISOString(),
  };
}

function toApiLot(lot: LotDocument): Lot {
  return {
    id: lot._id,
    tenantId: lot.tenantId,
    productId: lot.productId,
    kind: lot.kind,
    code: lot.code,
    expiresAt: lot.expiresAt?.toISOString() ?? null,
    createdAt: lot.createdAt.toISOString(),
  };
}

/**
 * Servicio central de inventario: es lo único que escribe en `inventory_movements` y `stock_levels`,
 * y siempre lo hace en la misma transacción (ver ADR 0002). Compras y ventas (fase 1C) lo reutilizarán
 * pasando su propia `session` para registrar el documento y el movimiento de forma atómica.
 */
export class InventoryService {
  public constructor(
    private readonly inventory: InventoryRepositories,
    private readonly catalogs: Pick<CatalogRepositories, 'product' | 'warehouse' | 'unit'>,
    private readonly audit: AuditLogRepository,
    private readonly transaction: TransactionRunner = withTransaction,
  ) {}

  // ── Validaciones de catálogo ─────────────────────────────────────

  private async loadProduct(tenantId: string, productId: string, { requireActive }: { requireActive: boolean }): Promise<ProductDocument> {
    const product = await this.catalogs.product.findById(productId, tenantId);
    if (!product) throw productNotFound();
    if (product.type !== 'good') throw new HttpError(400, 'PRODUCT_NOT_STOCKABLE', 'Services do not generate inventory movements');
    if (requireActive && !product.active) throw new HttpError(409, 'PRODUCT_INACTIVE', 'product is inactive');
    return product;
  }

  private async loadWarehouse(tenantId: string, warehouseId: string): Promise<WarehouseDocument> {
    const warehouse = await this.catalogs.warehouse.findById(warehouseId, tenantId);
    if (!warehouse) throw warehouseNotFound();
    if (!warehouse.active) throw new HttpError(409, 'WAREHOUSE_INACTIVE', 'warehouse is inactive');
    return warehouse;
  }

  /** La cantidad respeta los decimales de la unidad; una serie siempre se mueve de a una pieza. */
  private async parseQuantity(product: ProductDocument, quantity: string): Promise<Decimal> {
    const value = Decimal.parse(quantity);
    if (product.tracking === 'serial' && !value.abs().eq(Decimal.parse('1'))) {
      throw new HttpError(400, 'INVALID_SERIAL_QUANTITY', 'Serial-tracked products move one unit at a time');
    }
    const unit = await this.catalogs.unit.findById(product.unitId, product.tenantId);
    const decimals = unit?.decimals ?? 0;
    if (value.significantScale() > decimals) {
      throw new HttpError(400, 'INVALID_QUANTITY_PRECISION', `Quantity allows at most ${decimals} decimal places for this unit`);
    }
    return value;
  }

  /** Los productos con seguimiento exigen lote o serie; los demás no los admiten. Devuelve el código a usar. */
  private static trackingCode(product: ProductDocument, input: TrackingInput): string | null {
    const { lotCode, serialNumber } = input;
    const expected = product.tracking === 'lot' ? 'lotCode' : product.tracking === 'serial' ? 'serialNumber' : null;
    const unexpected = [
      ...(expected !== 'lotCode' && lotCode ? ['lotCode'] : []),
      ...(expected !== 'serialNumber' && serialNumber ? ['serialNumber'] : []),
      ...(expected !== 'lotCode' && input.lotExpiresAt ? ['lotExpiresAt'] : []),
    ];
    if (unexpected.length) {
      throw new HttpError(400, 'TRACKING_NOT_ALLOWED', `${unexpected.join(', ')} not allowed for tracking "${product.tracking}"`);
    }
    if (!expected) return null;
    const code = expected === 'lotCode' ? lotCode : serialNumber;
    if (!code) throw new HttpError(400, 'TRACKING_REQUIRED', `${expected} is required for this product`);
    return code;
  }

  /** Las entradas crean el lote/serie si no existe; las salidas lo exigen existente. */
  private async resolveLot(
    tenantId: string, product: ProductDocument, code: string | null,
    { incoming, expiresAt }: { incoming: boolean; expiresAt?: string }, session: ClientSession,
  ): Promise<string | null> {
    if (!code) return null;
    const existing = await this.inventory.lots.findByCode(tenantId, product._id, code, session);
    if (existing) return existing._id;
    if (!incoming) throw new HttpError(404, 'LOT_NOT_FOUND', `${product.tracking === 'serial' ? 'Serial number' : 'Lot'} "${code}" not found`);
    const lot = await this.inventory.lots.insert({
      tenantId, productId: product._id, kind: product.tracking === 'serial' ? 'serial' : 'lot', code,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    }, session);
    return lot._id;
  }

  private inTransaction<T>(session: ClientSession | undefined, work: (session: ClientSession) => Promise<T>): Promise<T> {
    return session ? work(session) : this.transaction(work);
  }

  // ── Núcleo: aplicar un movimiento ────────────────────────────────

  /**
   * Folio + movimiento + existencia, en la transacción recibida. Con la política de rechazo (por defecto),
   * una salida se aplica con una actualización condicional (`quantity >= salida`) sobre `stock_levels`.
   */
  private async applyLeg(ctx: InventoryContext, leg: Leg, allowNegativeStock: boolean, session: ClientSession): Promise<InventoryMovementDocument> {
    const { tenantId } = ctx;
    const number = await this.inventory.folios.next(tenantId, MOVEMENT_SERIES, session);
    const movement = await this.inventory.movements.insert({
      tenantId,
      folio: `${MOVEMENT_SERIES}-${number}`,
      series: MOVEMENT_SERIES,
      number,
      type: leg.type,
      productId: leg.product._id,
      warehouseId: leg.warehouseId,
      lotId: leg.lotId,
      quantity: leg.quantity.toDecimal128(),
      unitCost: leg.unitCost?.toDecimal128() ?? null,
      reference: leg.reference,
      reversedMovementId: leg.reversedMovementId,
      transferId: leg.transferId,
      userId: ctx.userId,
    }, session);

    const key = { tenantId, productId: leg.product._id, warehouseId: leg.warehouseId, lotId: leg.lotId };
    const isSerial = leg.product.tracking === 'serial';
    if (leg.quantity.isNegative() && (!allowNegativeStock || isSerial)) {
      const available = await this.inventory.stock.subtractIfAvailable(key, leg.quantity.abs().toDecimal128(), leg.quantity.toDecimal128(), session);
      if (!available) {
        throw new HttpError(409, 'INSUFFICIENT_STOCK', `Insufficient stock: the movement would leave the stock below zero`);
      }
    } else {
      await this.inventory.stock.add(key, leg.quantity.toDecimal128(), session);
    }

    if (isSerial && leg.lotId) {
      const total = await this.inventory.stock.sumForLot(tenantId, leg.lotId, session);
      if (total && Decimal.from(total).compare(Decimal.parse('1')) > 0) {
        throw new HttpError(409, 'SERIAL_ALREADY_IN_STOCK', 'A serial number cannot have stock greater than 1');
      }
    }
    return movement;
  }

  // ── Operaciones ──────────────────────────────────────────────────

  /** Entrada, salida o ajuste. Con `session`, participa en la transacción de quien llama (compras/ventas). */
  async recordMovement(input: MovementInput, ctx: InventoryContext, session?: ClientSession): Promise<InventoryMovement> {
    const product = await this.loadProduct(ctx.tenantId, input.productId, { requireActive: true });
    await this.loadWarehouse(ctx.tenantId, input.warehouseId);
    const code = InventoryService.trackingCode(product, input);
    const amount = await this.parseQuantity(product, input.quantity);
    const quantity = input.type === 'exit' ? amount.neg() : amount;
    const unitCost = Decimal.from(input.unitCost ?? product.cost);

    const movement = await this.inTransaction(session, async (tx) => {
      const { allowNegativeStock } = await this.inventory.settings.getInventory(ctx.tenantId, tx);
      const lotId = await this.resolveLot(ctx.tenantId, product, code, { incoming: quantity.isPositive(), expiresAt: input.lotExpiresAt }, tx);
      return this.applyLeg(ctx, {
        type: input.type, product, warehouseId: input.warehouseId, lotId, quantity, unitCost,
        reference: input.reference ?? null, reversedMovementId: null, transferId: null,
      }, allowNegativeStock, tx);
    });
    return toApiMovement(movement);
  }

  /** Salida del almacén origen y entrada al destino en una sola transacción: o se aplican ambas o ninguna. */
  async transfer(input: TransferInput, ctx: InventoryContext): Promise<{ transferId: string; out: InventoryMovement; in: InventoryMovement }> {
    const product = await this.loadProduct(ctx.tenantId, input.productId, { requireActive: true });
    await this.loadWarehouse(ctx.tenantId, input.fromWarehouseId);
    await this.loadWarehouse(ctx.tenantId, input.toWarehouseId);
    const code = InventoryService.trackingCode(product, input);
    const quantity = await this.parseQuantity(product, input.quantity);
    const unitCost = Decimal.from(product.cost);
    const transferId = randomUUID();

    const [outgoing, incoming] = await this.transaction(async (session) => {
      const { allowNegativeStock } = await this.inventory.settings.getInventory(ctx.tenantId, session);
      const lotId = await this.resolveLot(ctx.tenantId, product, code, { incoming: false }, session);
      const common = { product, lotId, unitCost, reference: input.reference ?? null, reversedMovementId: null, transferId };
      const out = await this.applyLeg(ctx, { ...common, type: 'transfer_out', warehouseId: input.fromWarehouseId, quantity: quantity.neg() }, allowNegativeStock, session);
      const into = await this.applyLeg(ctx, { ...common, type: 'transfer_in', warehouseId: input.toWarehouseId, quantity }, allowNegativeStock, session);
      return [out, into] as const;
    });
    return { transferId, out: toApiMovement(outgoing), in: toApiMovement(incoming) };
  }

  /**
   * Contra-asiento: inserta el movimiento inverso enlazado con `reversedMovementId`. Revertir una pata de un
   * traspaso revierte el traspaso completo. Una reversa no se revierte y nada se revierte dos veces.
   */
  async reverse(movementId: string, reason: string | undefined, ctx: InventoryContext): Promise<InventoryMovement[]> {
    try {
      const reversals = await this.transaction(async (session) => {
        const original = await this.inventory.movements.findById(ctx.tenantId, movementId, session);
        if (!original) throw movementNotFound();
        if (original.type === 'reversal') throw new HttpError(409, 'CANNOT_REVERSE_REVERSAL', 'A reversal cannot be reversed');

        const legs = original.transferId
          ? await this.inventory.movements.findByTransfer(ctx.tenantId, original.transferId, session)
          : [original];
        for (const leg of legs) {
          if (await this.inventory.movements.findReversalOf(ctx.tenantId, leg._id, session)) throw alreadyReversed();
        }

        const product = await this.loadProduct(ctx.tenantId, original.productId, { requireActive: false });
        const { allowNegativeStock } = await this.inventory.settings.getInventory(ctx.tenantId, session);
        const results: InventoryMovementDocument[] = [];
        for (const leg of legs) {
          results.push(await this.applyLeg(ctx, {
            type: 'reversal',
            product,
            warehouseId: leg.warehouseId,
            lotId: leg.lotId,
            quantity: Decimal.from(leg.quantity).neg(),
            unitCost: leg.unitCost ? Decimal.from(leg.unitCost) : null,
            reference: { type: 'reversal', id: leg.folio, ...(reason ? { note: reason } : {}) },
            reversedMovementId: leg._id,
            transferId: null,
          }, allowNegativeStock, session));
        }
        return results;
      });
      return reversals.map(toApiMovement);
    } catch (error) {
      // Respaldo del índice único parcial `{tenantId, reversedMovementId}` ante dos reversas simultáneas.
      if (error instanceof MongoServerError && error.code === 11000) throw alreadyReversed();
      throw error;
    }
  }

  // ── Consultas ────────────────────────────────────────────────────

  async getMovement(id: string, tenantId: string): Promise<InventoryMovement> {
    const movement = await this.inventory.movements.findById(tenantId, id);
    if (!movement) throw movementNotFound();
    return toApiMovement(movement);
  }

  async stock(query: z.output<typeof StockQuerySchema>, tenantId: string): Promise<Paginated<StockLevel>> {
    const page = await this.inventory.stock.findPage(tenantId, query, query);
    return { ...page, items: page.items.map(toApiStockLevel) };
  }

  /** Historial por folio con saldo acumulado. El saldo inicial incluye todo lo anterior a la página (también antes de `from`). */
  async kardex(productId: string, query: z.output<typeof KardexQuerySchema>, tenantId: string): Promise<Kardex> {
    if (!(await this.catalogs.product.findById(productId, tenantId))) throw productNotFound();
    const filter = {
      productId,
      warehouseId: query.warehouseId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    };
    const page = await this.inventory.movements.findPage(tenantId, filter, query);
    const first = page.items[0];
    const opening = first
      ? await this.inventory.movements.sumBefore(tenantId, { productId, warehouseId: query.warehouseId }, first.number)
      : null;

    let balance = opening ? Decimal.from(opening) : Decimal.ZERO;
    const openingBalance = balance.toString();
    const items = page.items.map((movement) => {
      balance = balance.add(Decimal.from(movement.quantity));
      return { ...toApiMovement(movement), balance: balance.toString() };
    });
    return { ...page, items, productId, warehouseId: query.warehouseId ?? null, openingBalance };
  }

  async createLot(input: LotInput, tenantId: string): Promise<Lot> {
    const product = await this.loadProduct(tenantId, input.productId, { requireActive: false });
    if (product.tracking === 'none') throw new HttpError(400, 'PRODUCT_NOT_TRACKED', 'product is not tracked by lot or serial');
    try {
      const lot = await this.inventory.lots.insert({
        tenantId, productId: product._id, kind: product.tracking, code: input.code,
        expiresAt: input.expiresAt && product.tracking === 'lot' ? new Date(input.expiresAt) : null,
      });
      return toApiLot(lot);
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new HttpError(409, 'LOT_ALREADY_EXISTS', 'A lot or serial with this code already exists for the product');
      }
      throw error;
    }
  }

  async listLots(query: z.output<typeof LotQuerySchema>, tenantId: string): Promise<Paginated<Lot>> {
    if (!(await this.catalogs.product.findById(query.productId, tenantId))) throw productNotFound();
    const page = await this.inventory.lots.findPage(tenantId, query.productId, query);
    return { ...page, items: page.items.map(toApiLot) };
  }

  async getSettings(tenantId: string): Promise<InventorySettings> {
    return this.inventory.settings.getInventory(tenantId);
  }

  async updateSettings(settings: InventorySettings, ctx: InventoryContext): Promise<InventorySettings> {
    const before = await this.inventory.settings.getInventory(ctx.tenantId);
    const after = await this.inventory.settings.setInventory(ctx.tenantId, settings);
    await this.audit.record({
      tenantId: ctx.tenantId, actorId: ctx.userId, action: 'update', entity: 'inventory.settings', entityId: ctx.tenantId, before, after,
    });
    return after;
  }

  /**
   * Recalcula existencias desde los movimientos y las compara con `stock_levels`. Solo reporta; no corrige.
   * Un registro ausente cuenta como cero.
   */
  async reconcile(tenantId: string): Promise<ReconciliationReport> {
    const keyOf = (row: { productId: string; warehouseId: string; lotId: string | null }) =>
      `${row.productId}|${row.warehouseId}|${row.lotId ?? ''}`;
    const [expectedRows, levels] = await Promise.all([
      this.inventory.movements.balances(tenantId),
      this.inventory.stock.findAll(tenantId),
    ]);

    const balances = new Map<string, { productId: string; warehouseId: string; lotId: string | null; expected: Decimal; actual: Decimal }>();
    for (const row of expectedRows) {
      balances.set(keyOf(row), { ...row, expected: Decimal.from(row.quantity), actual: Decimal.ZERO });
    }
    for (const level of levels) {
      const entry = balances.get(keyOf(level))
        ?? { productId: level.productId, warehouseId: level.warehouseId, lotId: level.lotId, expected: Decimal.ZERO, actual: Decimal.ZERO };
      entry.actual = Decimal.from(level.quantity);
      balances.set(keyOf(level), entry);
    }

    const differences: ReconciliationDifference[] = [...balances.values()]
      .filter((entry) => !entry.expected.eq(entry.actual))
      .map(({ productId, warehouseId, lotId, expected, actual }) => ({
        productId, warehouseId, lotId, expected: expected.toString(), actual: actual.toString(),
      }));
    return { tenantId, checkedAt: new Date().toISOString(), balancesChecked: balances.size, differences };
  }
}
