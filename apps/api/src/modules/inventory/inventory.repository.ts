import { randomUUID } from 'node:crypto';
import { Decimal128, MongoServerError, type ClientSession, type Collection, type Db, type Filter } from 'mongodb';
import type { InventorySettings, MovementReference, MovementType } from '@erp/domain';
import { TransactionConflictError } from '../../config/database';
import type { Page, PageRequest } from '../../core/repository';

export const INVENTORY_MOVEMENTS_COLLECTION = 'inventory_movements';
export const STOCK_LEVELS_COLLECTION = 'stock_levels';
export const LOTS_COLLECTION = 'lots';
export const FOLIO_COUNTERS_COLLECTION = 'folio_counters';
export const TENANT_SETTINGS_COLLECTION = 'tenant_settings';

/** Fuente de verdad del inventario. Inmutable: no tiene `updatedAt` ni `deletedAt`. */
export interface InventoryMovementDocument {
  _id: string;
  tenantId: string;
  folio: string;
  series: string;
  number: number;
  type: MovementType;
  productId: string;
  warehouseId: string;
  lotId: string | null;
  quantity: Decimal128;
  unitCost: Decimal128 | null;
  reference: MovementReference | null;
  reversedMovementId: string | null;
  transferId: string | null;
  userId: string;
  createdAt: Date;
}
export type NewMovement = Omit<InventoryMovementDocument, '_id' | 'createdAt'>;

/** Caché derivada de los movimientos; se puede reconstruir y se reconcilia contra ellos. */
export interface StockLevelDocument {
  _id: string;
  tenantId: string;
  productId: string;
  warehouseId: string;
  lotId: string | null;
  quantity: Decimal128;
  updatedAt: Date;
}

export interface StockKey {
  tenantId: string;
  productId: string;
  warehouseId: string;
  lotId: string | null;
}

/** Lotes y números de serie: una serie es un "lote" cuya existencia total nunca pasa de 1. */
export interface LotDocument {
  _id: string;
  tenantId: string;
  productId: string;
  kind: 'lot' | 'serial';
  code: string;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface FolioCounterDocument {
  _id: string;
  tenantId: string;
  series: string;
  value: number;
}

export interface TenantSettingsDocument {
  _id: string;
  tenantId: string;
  inventory: InventorySettings;
  updatedAt: Date;
}

export const DEFAULT_INVENTORY_SETTINGS: InventorySettings = { allowNegativeStock: false };

const isDuplicateKey = (error: unknown) => error instanceof MongoServerError && error.code === 11000;

/**
 * Upsert que, bajo concurrencia, puede chocar con el índice único porque otra transacción creó el mismo
 * documento después de nuestra instantánea: se pide reintentar la transacción completa.
 */
async function upsertOrConflict<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isDuplicateKey(error)) throw new TransactionConflictError();
    throw error;
  }
}

export interface MovementFilter {
  productId: string;
  warehouseId?: string;
  from?: Date;
  to?: Date;
}

export interface BalanceRow {
  productId: string;
  warehouseId: string;
  lotId: string | null;
  quantity: Decimal128;
}

/** Solo inserción y lectura. A propósito no existe ningún método para modificar ni borrar un movimiento. */
export class InventoryMovementsRepository {
  public constructor(private readonly collection: Collection<InventoryMovementDocument>) {}

  async insert(movement: NewMovement, session: ClientSession): Promise<InventoryMovementDocument> {
    if (!movement.tenantId) throw new Error('tenantId is required for repository queries');
    const document: InventoryMovementDocument = { ...movement, _id: randomUUID(), createdAt: new Date() };
    await this.collection.insertOne(document, { session });
    return document;
  }

  async findById(tenantId: string, id: string, session?: ClientSession): Promise<InventoryMovementDocument | null> {
    return this.collection.findOne({ tenantId, _id: id }, { session });
  }

  async findByTransfer(tenantId: string, transferId: string, session?: ClientSession): Promise<InventoryMovementDocument[]> {
    return this.collection.find({ tenantId, transferId }, { session }).sort({ number: 1 }).toArray();
  }

  async findReversalOf(tenantId: string, movementId: string, session?: ClientSession): Promise<InventoryMovementDocument | null> {
    return this.collection.findOne({ tenantId, reversedMovementId: movementId }, { session });
  }

  private kardexFilter(tenantId: string, { productId, warehouseId, from, to }: MovementFilter): Filter<InventoryMovementDocument> {
    const filter: Filter<InventoryMovementDocument> = { tenantId, productId };
    if (warehouseId) filter.warehouseId = warehouseId;
    if (from || to) filter.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    return filter;
  }

  /** Movimientos en orden de folio (el folio se asigna dentro de la transacción, así que refleja el orden de commit). */
  async findPage(tenantId: string, filter: MovementFilter, { page, pageSize }: PageRequest): Promise<Page<InventoryMovementDocument>> {
    const query = this.kardexFilter(tenantId, filter);
    const [items, total] = await Promise.all([
      this.collection.find(query).sort({ number: 1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
      this.collection.countDocuments(query),
    ]);
    return { items, page, pageSize, total };
  }

  /** Suma de cantidades anteriores al folio `beforeNumber` (saldo inicial del kardex). */
  async sumBefore(tenantId: string, filter: Pick<MovementFilter, 'productId' | 'warehouseId'>, beforeNumber: number): Promise<Decimal128 | null> {
    const [row] = await this.collection.aggregate<{ total: Decimal128 }>([
      { $match: { ...this.kardexFilter(tenantId, filter), number: { $lt: beforeNumber } } },
      { $group: { _id: null, total: { $sum: '$quantity' } } },
    ]).toArray();
    return row?.total ?? null;
  }

  /** Existencia esperada por producto/almacén/lote, calculada por el servidor con aritmética Decimal128. */
  async balances(tenantId: string): Promise<BalanceRow[]> {
    return this.collection.aggregate<BalanceRow>([
      { $match: { tenantId } },
      { $group: { _id: { productId: '$productId', warehouseId: '$warehouseId', lotId: '$lotId' }, quantity: { $sum: '$quantity' } } },
      { $project: { _id: 0, productId: '$_id.productId', warehouseId: '$_id.warehouseId', lotId: '$_id.lotId', quantity: 1 } },
    ]).toArray();
  }
}

/** La escribe únicamente `InventoryService`, dentro de la misma transacción que el movimiento que la respalda. */
export class StockLevelsRepository {
  public constructor(private readonly collection: Collection<StockLevelDocument>) {}

  private static filter(key: StockKey): Filter<StockLevelDocument> {
    if (!key.tenantId) throw new Error('tenantId is required for repository queries');
    return { tenantId: key.tenantId, productId: key.productId, warehouseId: key.warehouseId, lotId: key.lotId };
  }

  /** Suma `delta` (con signo) sin condición; crea el registro si no existía. */
  async add(key: StockKey, delta: Decimal128, session: ClientSession): Promise<void> {
    await upsertOrConflict(() => this.collection.updateOne(
      StockLevelsRepository.filter(key),
      { $inc: { quantity: delta }, $set: { updatedAt: new Date() }, $setOnInsert: { _id: randomUUID() } },
      { upsert: true, session },
    ));
  }

  /**
   * Resta `amount` (positivo) solo si hay existencia suficiente. La condición y la resta son una única operación
   * atómica sobre el documento; dentro de la transacción, dos salidas concurrentes sobre la misma existencia chocan
   * (WriteConflict) y la que se reintenta vuelve a evaluar la condición con el valor ya actualizado.
   */
  async subtractIfAvailable(key: StockKey, amount: Decimal128, negated: Decimal128, session: ClientSession): Promise<boolean> {
    const result = await this.collection.updateOne(
      { ...StockLevelsRepository.filter(key), quantity: { $gte: amount } },
      { $inc: { quantity: negated }, $set: { updatedAt: new Date() } },
      { session },
    );
    return result.matchedCount === 1;
  }

  async find(key: StockKey, session?: ClientSession): Promise<StockLevelDocument | null> {
    return this.collection.findOne(StockLevelsRepository.filter(key), { session });
  }

  /** Existencia total de un lote o serie en todos los almacenes. */
  async sumForLot(tenantId: string, lotId: string, session?: ClientSession): Promise<Decimal128 | null> {
    const [row] = await this.collection.aggregate<{ total: Decimal128 }>([
      { $match: { tenantId, lotId } },
      { $group: { _id: null, total: { $sum: '$quantity' } } },
    ], { session }).toArray();
    return row?.total ?? null;
  }

  /** Existencias distintas de cero, filtradas por producto y/o almacén. */
  async findPage(tenantId: string, filter: { productId?: string; warehouseId?: string }, { page, pageSize }: PageRequest): Promise<Page<StockLevelDocument>> {
    const query: Filter<StockLevelDocument> = { tenantId, quantity: { $ne: Decimal128.fromString('0') } };
    if (filter.productId) query.productId = filter.productId;
    if (filter.warehouseId) query.warehouseId = filter.warehouseId;
    const [items, total] = await Promise.all([
      this.collection.find(query).sort({ productId: 1, warehouseId: 1, lotId: 1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
      this.collection.countDocuments(query),
    ]);
    return { items, page, pageSize, total };
  }

  async findAll(tenantId: string): Promise<StockLevelDocument[]> {
    return this.collection.find({ tenantId }).toArray();
  }
}

export class LotsRepository {
  public constructor(private readonly collection: Collection<LotDocument>) {}

  async findByCode(tenantId: string, productId: string, code: string, session?: ClientSession): Promise<LotDocument | null> {
    return this.collection.findOne({ tenantId, productId, code }, { session });
  }

  async findPage(tenantId: string, productId: string, { page, pageSize }: PageRequest): Promise<Page<LotDocument>> {
    const query = { tenantId, productId };
    const [items, total] = await Promise.all([
      this.collection.find(query).sort({ code: 1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
      this.collection.countDocuments(query),
    ]);
    return { items, page, pageSize, total };
  }

  /** Fuera de transacción un duplicado es un error del usuario (11000); dentro, un conflicto a reintentar. */
  async insert(lot: Omit<LotDocument, '_id' | 'createdAt'>, session?: ClientSession): Promise<LotDocument> {
    if (!lot.tenantId) throw new Error('tenantId is required for repository queries');
    const document: LotDocument = { ...lot, _id: randomUUID(), createdAt: new Date() };
    const insert = () => this.collection.insertOne(document, { session });
    await (session ? upsertOrConflict(insert) : insert());
    return document;
  }
}

export class FolioCountersRepository {
  public constructor(private readonly collection: Collection<FolioCounterDocument>) {}

  /**
   * Siguiente folio de la serie. Se llama dentro de la transacción del movimiento: si la transacción aborta,
   * el incremento también se revierte y no quedan huecos.
   */
  async next(tenantId: string, series: string, session: ClientSession): Promise<number> {
    if (!tenantId) throw new Error('tenantId is required for repository queries');
    const counter = await upsertOrConflict(() => this.collection.findOneAndUpdate(
      { _id: `${tenantId}:${series}` },
      { $inc: { value: 1 }, $setOnInsert: { tenantId, series } },
      { upsert: true, returnDocument: 'after', session },
    ));
    if (!counter) throw new Error('Folio counter upsert returned no document');
    return counter.value;
  }
}

export class TenantSettingsRepository {
  public constructor(private readonly collection: Collection<TenantSettingsDocument>) {}

  async getInventory(tenantId: string, session?: ClientSession): Promise<InventorySettings> {
    const settings = await this.collection.findOne({ _id: tenantId, tenantId }, { session });
    return { ...DEFAULT_INVENTORY_SETTINGS, ...settings?.inventory };
  }

  async setInventory(tenantId: string, inventory: InventorySettings): Promise<InventorySettings> {
    if (!tenantId) throw new Error('tenantId is required for repository queries');
    await this.collection.updateOne(
      { _id: tenantId, tenantId },
      { $set: { inventory, updatedAt: new Date() } },
      { upsert: true },
    );
    return inventory;
  }
}

export function inventoryRepositories(db: Db) {
  return {
    movements: new InventoryMovementsRepository(db.collection<InventoryMovementDocument>(INVENTORY_MOVEMENTS_COLLECTION)),
    stock: new StockLevelsRepository(db.collection<StockLevelDocument>(STOCK_LEVELS_COLLECTION)),
    lots: new LotsRepository(db.collection<LotDocument>(LOTS_COLLECTION)),
    folios: new FolioCountersRepository(db.collection<FolioCounterDocument>(FOLIO_COUNTERS_COLLECTION)),
    settings: new TenantSettingsRepository(db.collection<TenantSettingsDocument>(TENANT_SETTINGS_COLLECTION)),
  };
}
export type InventoryRepositories = ReturnType<typeof inventoryRepositories>;

export async function ensureInventoryIndexes(db: Db): Promise<void> {
  await db.collection(INVENTORY_MOVEMENTS_COLLECTION).createIndexes([
    { key: { tenantId: 1, productId: 1, warehouseId: 1, createdAt: -1 }, name: 'tenant_product_warehouse_created' },
    { key: { tenantId: 1, folio: 1 }, name: 'tenant_folio_unique', unique: true },
    { key: { tenantId: 1, productId: 1, number: 1 }, name: 'tenant_product_number' },
    { key: { tenantId: 1, transferId: 1 }, name: 'tenant_transfer', partialFilterExpression: { transferId: { $type: 'string' } } },
    // Un movimiento solo puede revertirse una vez: lo garantiza la base, no solo el servicio.
    {
      key: { tenantId: 1, reversedMovementId: 1 },
      name: 'tenant_reversed_movement_unique',
      unique: true,
      partialFilterExpression: { reversedMovementId: { $type: 'string' } },
    },
  ]);
  await db.collection(STOCK_LEVELS_COLLECTION).createIndexes([
    { key: { tenantId: 1, productId: 1, warehouseId: 1, lotId: 1 }, name: 'tenant_product_warehouse_lot_unique', unique: true },
    { key: { tenantId: 1, warehouseId: 1 }, name: 'tenant_warehouse' },
    { key: { tenantId: 1, lotId: 1 }, name: 'tenant_lot' },
  ]);
  await db.collection(LOTS_COLLECTION).createIndexes([
    { key: { tenantId: 1, productId: 1, code: 1 }, name: 'tenant_product_code_unique', unique: true },
  ]);
  await db.collection(FOLIO_COUNTERS_COLLECTION).createIndexes([
    { key: { tenantId: 1, series: 1 }, name: 'tenant_series_unique', unique: true },
  ]);
}
