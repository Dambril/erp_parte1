import { randomUUID } from 'node:crypto';
import { Decimal128 } from 'mongodb';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { getDatabase } from '../../config/database';
import { api, createUserAndLogin, listRoutes, startDatabase, stopDatabase } from '../../test/helpers';
import {
  FOLIO_COUNTERS_COLLECTION, INVENTORY_MOVEMENTS_COLLECTION, InventoryMovementsRepository, STOCK_LEVELS_COLLECTION,
  StockLevelsRepository,
} from './inventory.repository';
import { inventoryRoutes } from './inventory.routes';

let replSet: MongoMemoryReplSet;
const tokens = { adminA: '', adminB: '', managerA: '', viewerA: '' };
const ids = { kg: '', pza: '', w1: '', w2: '', inactiveWarehouse: '', service: '' };

type Json = Record<string, unknown>;

async function create(resource: string, body: object, token = tokens.adminA): Promise<string> {
  const response = await api(token).post(`/catalogs/${resource}`, body);
  if (response.status !== 201) throw new Error(`POST ${resource} → ${response.status} ${JSON.stringify(response.body)}`);
  return response.body.data.id;
}

async function newProduct(tracking: 'none' | 'lot' | 'serial' = 'none', unitId = ids.kg): Promise<string> {
  return create('products', { sku: `SKU-${randomUUID().slice(0, 8)}`, name: 'Producto', type: 'good', unitId, tracking, cost: '2.50' });
}

const move = (body: Json, token = tokens.adminA) => api(token).post('/inventory/movements', body);

async function entry(productId: string, quantity: string, warehouseId = ids.w1, extra: Json = {}) {
  const response = await move({ type: 'entry', productId, warehouseId, quantity, ...extra });
  if (response.status !== 201) throw new Error(`entry → ${response.status} ${JSON.stringify(response.body)}`);
  return response.body.data as { id: string; folio: string; number: number; lotId: string | null };
}

/** Existencia tal como está guardada en `stock_levels` (texto de Decimal128), o `null` si no hay registro. */
async function storedStock(productId: string, warehouseId = ids.w1): Promise<string | null> {
  const level = await getDatabase().collection(STOCK_LEVELS_COLLECTION).findOne({ tenantId: 'tenant-a', productId, warehouseId });
  return level ? (level.quantity as Decimal128).toString() : null;
}

async function stockViaApi(productId: string, warehouseId = ids.w1): Promise<string> {
  const response = await api(tokens.adminA).get(`/inventory/stock?productId=${productId}&warehouseId=${warehouseId}`);
  const [level] = response.body.data.items as { quantity: string }[];
  return level?.quantity ?? '0';
}

const movementCount = (tenantId = 'tenant-a') => getDatabase().collection(INVENTORY_MOVEMENTS_COLLECTION).countDocuments({ tenantId });
const folioValue = async () =>
  (await getDatabase().collection(FOLIO_COUNTERS_COLLECTION).findOne({ tenantId: 'tenant-a', series: 'MOV' }))?.value ?? 0;

beforeAll(async () => {
  replSet = await startDatabase();
  tokens.adminA = await createUserAndLogin('admin-a@example.com', 'admin', 'tenant-a');
  tokens.adminB = await createUserAndLogin('admin-b@example.com', 'admin', 'tenant-b');
  tokens.managerA = await createUserAndLogin('manager-a@example.com', 'manager', 'tenant-a');
  tokens.viewerA = await createUserAndLogin('viewer-a@example.com', 'viewer', 'tenant-a');
  ids.kg = await create('units', { code: 'KG', name: 'Kilogramo', decimals: 3 });
  ids.pza = await create('units', { code: 'PZA', name: 'Pieza', decimals: 0 });
  ids.w1 = await create('warehouses', { code: 'W1', name: 'Central' });
  ids.w2 = await create('warehouses', { code: 'W2', name: 'Sucursal', branch: 'Norte' });
  ids.inactiveWarehouse = await create('warehouses', { code: 'W3', name: 'Cerrado', active: false });
  ids.service = await create('products', { sku: 'SRV-1', name: 'Instalación', type: 'service', unitId: ids.pza });
}, 120_000);

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await stopDatabase(replSet);
});

describe('entries, exits and adjustments', () => {
  it('records an entry and an exit, updating stock inside the same transaction', async () => {
    const productId = await newProduct();
    const created = await entry(productId, '10');
    expect(created).toMatchObject({ folio: `MOV-${created.number}`, lotId: null });
    const exit = await move({ type: 'exit', productId, warehouseId: ids.w1, quantity: '4', reference: { type: 'manual', note: 'merma' } });
    expect(exit.status).toBe(201);
    expect(exit.body.data).toMatchObject({ type: 'exit', quantity: '-4', unitCost: '2.5', reference: { type: 'manual', note: 'merma' } });
    expect(await stockViaApi(productId)).toBe('6');
  });

  it('applies signed adjustments', async () => {
    const productId = await newProduct();
    await entry(productId, '5');
    expect((await move({ type: 'adjustment', productId, warehouseId: ids.w1, quantity: '-1.5' })).status).toBe(201);
    expect((await move({ type: 'adjustment', productId, warehouseId: ids.w1, quantity: '0.25' })).status).toBe(201);
    expect(await stockViaApi(productId)).toBe('3.75');
  });

  it('adds decimals exactly with Decimal128 (0.1 + 0.2 = 0.3)', async () => {
    const productId = await newProduct();
    await entry(productId, '0.1');
    await entry(productId, '0.2');
    expect(await storedStock(productId)).toBe('0.3');
    const exit = await move({ type: 'exit', productId, warehouseId: ids.w1, quantity: '0.3' });
    expect(exit.status).toBe(201);
    expect(await stockViaApi(productId)).toBe('0');
    const stored = await getDatabase().collection(INVENTORY_MOVEMENTS_COLLECTION).findOne({ _id: exit.body.data.id });
    expect(stored?.quantity).toBeInstanceOf(Decimal128);
  });

  it('validates quantities: strings only, positive for entry/exit, and within the unit decimals', async () => {
    const productId = await newProduct();
    const asNumber = await move({ type: 'entry', productId, warehouseId: ids.w1, quantity: 1 });
    expect(asNumber.status).toBe(400);
    const negativeEntry = await move({ type: 'entry', productId, warehouseId: ids.w1, quantity: '-1' });
    expect(negativeEntry.status).toBe(400);
    const tooPrecise = await move({ type: 'entry', productId, warehouseId: ids.w1, quantity: '1.0001' });
    expect(tooPrecise.body.error.code).toBe('INVALID_QUANTITY_PRECISION');
    const pieces = await newProduct('none', ids.pza);
    expect((await move({ type: 'entry', productId: pieces, warehouseId: ids.w1, quantity: '1.5' })).status).toBe(400);
  });

  it('rejects services, inactive warehouses and unknown products', async () => {
    const service = await move({ type: 'entry', productId: ids.service, warehouseId: ids.w1, quantity: '1' });
    expect(service.body.error.code).toBe('PRODUCT_NOT_STOCKABLE');
    const productId = await newProduct();
    const inactive = await move({ type: 'entry', productId, warehouseId: ids.inactiveWarehouse, quantity: '1' });
    expect(inactive.body.error.code).toBe('WAREHOUSE_INACTIVE');
    const unknown = await move({ type: 'entry', productId: randomUUID(), warehouseId: ids.w1, quantity: '1' });
    expect(unknown.status).toBe(404);
  });
});

describe('negative stock policy', () => {
  it('rejects an exit larger than the stock and leaves no trace', async () => {
    const productId = await newProduct();
    await entry(productId, '3');
    const [movementsBefore, folioBefore] = [await movementCount(), await folioValue()];

    const response = await move({ type: 'exit', productId, warehouseId: ids.w1, quantity: '3.001' });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INSUFFICIENT_STOCK');

    expect(await movementCount()).toBe(movementsBefore);
    expect(await folioValue()).toBe(folioBefore);
    expect(await storedStock(productId)).toBe('3');
  });

  it('rejects an exit from a warehouse that never had stock without creating a stock record', async () => {
    const productId = await newProduct();
    const response = await move({ type: 'exit', productId, warehouseId: ids.w2, quantity: '1' });
    expect(response.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await storedStock(productId, ids.w2)).toBeNull();
  });

  it('is configurable per tenant (admin only) and defaults to reject', async () => {
    expect((await api(tokens.adminA).get('/inventory/settings')).body.data).toEqual({ allowNegativeStock: false });
    expect((await api(tokens.managerA).put('/inventory/settings', { allowNegativeStock: true })).status).toBe(403);

    expect((await api(tokens.adminA).put('/inventory/settings', { allowNegativeStock: true })).status).toBe(200);
    const productId = await newProduct();
    const response = await move({ type: 'exit', productId, warehouseId: ids.w1, quantity: '2' });
    expect(response.status).toBe(201);
    expect(await stockViaApi(productId)).toBe('-2');
    // El otro tenant conserva su política por defecto.
    expect((await api(tokens.adminB).get('/inventory/settings')).body.data.allowNegativeStock).toBe(false);

    await api(tokens.adminA).put('/inventory/settings', { allowNegativeStock: false });
    await entry(productId, '2');
  });
});

describe('concurrency', () => {
  it('lets exactly one of two simultaneous exits succeed when stock only covers one', async () => {
    const productId = await newProduct();
    await entry(productId, '10');
    const exit = () => move({ type: 'exit', productId, warehouseId: ids.w1, quantity: '7' });

    const responses = await Promise.all([exit(), exit()]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(responses.find((response) => response.status === 409)?.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await storedStock(productId)).toBe('3');
  });

  it('assigns folios without duplicates or gaps under concurrent creation', async () => {
    const productId = await newProduct();
    const responses = await Promise.all(Array.from({ length: 12 }, () => move({ type: 'entry', productId, warehouseId: ids.w1, quantity: '1' })));
    expect(responses.every((response) => response.status === 201)).toBe(true);

    const numbers = responses.map((response) => response.body.data.number as number).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(12);
    expect(numbers[11] - numbers[0]).toBe(11);
    expect(await storedStock(productId)).toBe('12');

    // En todo el tenant, los folios son exactamente 1..N (ni los rechazos ni los rollbacks dejan huecos).
    const all = await getDatabase().collection(INVENTORY_MOVEMENTS_COLLECTION)
      .find({ tenantId: 'tenant-a' }, { projection: { number: 1 } }).toArray();
    const sorted = all.map((movement) => movement.number as number).sort((a, b) => a - b);
    expect(sorted).toEqual(Array.from({ length: sorted.length }, (_, index) => index + 1));
    expect(await folioValue()).toBe(sorted.length);
  });
});

describe('transfers', () => {
  it('moves stock between warehouses with two linked movements', async () => {
    const productId = await newProduct();
    await entry(productId, '8');
    const response = await api(tokens.adminA).post('/inventory/transfers', {
      productId, fromWarehouseId: ids.w1, toWarehouseId: ids.w2, quantity: '5',
    });
    expect(response.status).toBe(201);
    const { transferId, out, in: incoming } = response.body.data;
    expect(out).toMatchObject({ type: 'transfer_out', quantity: '-5', warehouseId: ids.w1, transferId });
    expect(incoming).toMatchObject({ type: 'transfer_in', quantity: '5', warehouseId: ids.w2, transferId });
    expect(await stockViaApi(productId, ids.w1)).toBe('3');
    expect(await stockViaApi(productId, ids.w2)).toBe('5');
  });

  it('rejects a transfer without enough stock and leaves nothing behind', async () => {
    const productId = await newProduct();
    await entry(productId, '1');
    const before = await movementCount();
    const response = await api(tokens.adminA).post('/inventory/transfers', {
      productId, fromWarehouseId: ids.w1, toWarehouseId: ids.w2, quantity: '2',
    });
    expect(response.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await movementCount()).toBe(before);
    expect(await storedStock(productId, ids.w2)).toBeNull();
  });

  it('rolls back completely when the transfer fails halfway', async () => {
    const productId = await newProduct();
    await entry(productId, '10');
    const [movementsBefore, folioBefore] = [await movementCount(), await folioValue()];

    // La salida (resta condicional) se aplica; la entrada al destino falla a mitad de la transacción.
    const add = jest.spyOn(StockLevelsRepository.prototype, 'add').mockRejectedValueOnce(new Error('simulated failure'));
    const response = await api(tokens.adminA).post('/inventory/transfers', {
      productId, fromWarehouseId: ids.w1, toWarehouseId: ids.w2, quantity: '4',
    });
    expect(add).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(500);

    expect(await movementCount()).toBe(movementsBefore);
    expect(await folioValue()).toBe(folioBefore);
    expect(await storedStock(productId, ids.w1)).toBe('10');
    expect(await storedStock(productId, ids.w2)).toBeNull();
  });

  it('rejects the same source and destination', async () => {
    const productId = await newProduct();
    const response = await api(tokens.adminA).post('/inventory/transfers', {
      productId, fromWarehouseId: ids.w1, toWarehouseId: ids.w1, quantity: '1',
    });
    expect(response.status).toBe(400);
  });
});

describe('reversals', () => {
  it('restores stock, links to the original and cannot be repeated', async () => {
    const productId = await newProduct();
    const original = await entry(productId, '5');

    const response = await api(tokens.adminA).post(`/inventory/movements/${original.id}/reverse`, { reason: 'captura errónea' });
    expect(response.status).toBe(201);
    const [reversal] = response.body.data;
    expect(reversal).toMatchObject({
      type: 'reversal', quantity: '-5', reversedMovementId: original.id,
      reference: { type: 'reversal', id: original.folio, note: 'captura errónea' },
    });
    expect(await stockViaApi(productId)).toBe('0');

    const again = await api(tokens.adminA).post(`/inventory/movements/${original.id}/reverse`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('MOVEMENT_ALREADY_REVERSED');
    const ofReversal = await api(tokens.adminA).post(`/inventory/movements/${reversal.id}/reverse`);
    expect(ofReversal.body.error.code).toBe('CANNOT_REVERSE_REVERSAL');
  });

  it('allows only one of two simultaneous reversals', async () => {
    const productId = await newProduct();
    const original = await entry(productId, '2');
    const reverse = () => api(tokens.adminA).post(`/inventory/movements/${original.id}/reverse`);
    const responses = await Promise.all([reverse(), reverse()]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await stockViaApi(productId)).toBe('0');
  });

  it('reverses both legs of a transfer', async () => {
    const productId = await newProduct();
    await entry(productId, '6');
    const transfer = await api(tokens.adminA).post('/inventory/transfers', {
      productId, fromWarehouseId: ids.w1, toWarehouseId: ids.w2, quantity: '6',
    });
    const response = await api(tokens.adminA).post(`/inventory/movements/${transfer.body.data.in.id}/reverse`);
    expect(response.status).toBe(201);
    expect(response.body.data).toHaveLength(2);
    expect(await stockViaApi(productId, ids.w1)).toBe('6');
    expect(await stockViaApi(productId, ids.w2)).toBe('0');
  });

  it('does not reverse an entry whose stock was already consumed', async () => {
    const productId = await newProduct();
    const original = await entry(productId, '4');
    await move({ type: 'exit', productId, warehouseId: ids.w1, quantity: '3' });
    const response = await api(tokens.adminA).post(`/inventory/movements/${original.id}/reverse`);
    expect(response.body.error.code).toBe('INSUFFICIENT_STOCK');
  });
});

describe('lots and serials', () => {
  it('requires a lot for lot-tracked products and keeps stock per lot', async () => {
    const productId = await newProduct('lot');
    const missing = await move({ type: 'entry', productId, warehouseId: ids.w1, quantity: '1' });
    expect(missing.body.error.code).toBe('TRACKING_REQUIRED');

    const first = await entry(productId, '3', ids.w1, { lotCode: 'L-001', lotExpiresAt: '2027-01-31T00:00:00.000Z' });
    await entry(productId, '2', ids.w1, { lotCode: 'L-002' });
    expect(first.lotId).toEqual(expect.any(String));

    const tooMuchFromLot = await move({ type: 'exit', productId, warehouseId: ids.w1, quantity: '4', lotCode: 'L-001' });
    expect(tooMuchFromLot.body.error.code).toBe('INSUFFICIENT_STOCK');
    const unknownLot = await move({ type: 'exit', productId, warehouseId: ids.w1, quantity: '1', lotCode: 'L-999' });
    expect(unknownLot.body.error.code).toBe('LOT_NOT_FOUND');

    const lots = await api(tokens.adminA).get(`/inventory/lots?productId=${productId}`);
    expect(lots.body.data.items.map((lot: { code: string }) => lot.code)).toEqual(['L-001', 'L-002']);
    expect(lots.body.data.items[0].expiresAt).toBe('2027-01-31T00:00:00.000Z');
  });

  it('never lets a serial number have stock greater than 1', async () => {
    const productId = await newProduct('serial', ids.pza);
    expect((await move({ type: 'entry', productId, warehouseId: ids.w1, quantity: '1' })).body.error.code).toBe('TRACKING_REQUIRED');
    expect((await move({ type: 'entry', productId, warehouseId: ids.w1, quantity: '2', serialNumber: 'SN-1' })).body.error.code)
      .toBe('INVALID_SERIAL_QUANTITY');

    await entry(productId, '1', ids.w1, { serialNumber: 'SN-1' });
    const duplicate = await move({ type: 'entry', productId, warehouseId: ids.w2, quantity: '1', serialNumber: 'SN-1' });
    expect(duplicate.body.error.code).toBe('SERIAL_ALREADY_IN_STOCK');

    const transfer = await api(tokens.adminA).post('/inventory/transfers', {
      productId, fromWarehouseId: ids.w1, toWarehouseId: ids.w2, quantity: '1', serialNumber: 'SN-1',
    });
    expect(transfer.status).toBe(201);
    expect(await stockViaApi(productId, ids.w2)).toBe('1');
  });

  it('keeps serials non-negative even when the tenant allows negative stock', async () => {
    const productId = await newProduct('serial', ids.pza);
    await api(tokens.adminA).post('/inventory/lots', { productId, code: 'SN-NEG' });
    await api(tokens.adminA).put('/inventory/settings', { allowNegativeStock: true });
    try {
      const response = await move({ type: 'exit', productId, warehouseId: ids.w1, quantity: '1', serialNumber: 'SN-NEG' });
      expect(response.body.error.code).toBe('INSUFFICIENT_STOCK');
    } finally {
      await api(tokens.adminA).put('/inventory/settings', { allowNegativeStock: false });
    }
  });

  it('rejects lot data for untracked products and duplicate lots', async () => {
    const plain = await newProduct();
    expect((await move({ type: 'entry', productId: plain, warehouseId: ids.w1, quantity: '1', lotCode: 'X' })).body.error.code)
      .toBe('TRACKING_NOT_ALLOWED');
    expect((await api(tokens.adminA).post('/inventory/lots', { productId: plain, code: 'X' })).body.error.code).toBe('PRODUCT_NOT_TRACKED');

    const tracked = await newProduct('lot');
    expect((await api(tokens.adminA).post('/inventory/lots', { productId: tracked, code: 'DUP' })).status).toBe(201);
    expect((await api(tokens.adminA).post('/inventory/lots', { productId: tracked, code: 'DUP' })).body.error.code).toBe('LOT_ALREADY_EXISTS');
  });
});

describe('queries', () => {
  it('returns the kardex with running balance, filters and pagination', async () => {
    const productId = await newProduct();
    await entry(productId, '10');
    await move({ type: 'exit', productId, warehouseId: ids.w1, quantity: '3' });
    await entry(productId, '4', ids.w2);
    await entry(productId, '2');

    const all = await api(tokens.adminA).get(`/inventory/kardex/${productId}`);
    expect(all.status).toBe(200);
    expect(all.body.data.items.map((item: { balance: string }) => item.balance)).toEqual(['10', '7', '11', '13']);

    const w1Page2 = await api(tokens.adminA).get(`/inventory/kardex/${productId}?warehouseId=${ids.w1}&page=2&pageSize=2`);
    expect(w1Page2.body.data).toMatchObject({ total: 3, page: 2, openingBalance: '7', warehouseId: ids.w1 });
    expect(w1Page2.body.data.items.map((item: { quantity: string; balance: string }) => [item.quantity, item.balance])).toEqual([['2', '9']]);

    const future = await api(tokens.adminA).get(`/inventory/kardex/${productId}?from=2999-01-01T00:00:00.000Z`);
    expect(future.body.data.total).toBe(0);
  });

  it('lists stock per product and warehouse', async () => {
    const productId = await newProduct();
    await entry(productId, '1', ids.w1);
    await entry(productId, '2', ids.w2);
    const response = await api(tokens.adminA).get(`/inventory/stock?productId=${productId}`);
    expect(response.body.data.total).toBe(2);
    const byWarehouse = Object.fromEntries(response.body.data.items.map((level: { warehouseId: string; quantity: string }) => [level.warehouseId, level.quantity]));
    expect(byWarehouse).toEqual({ [ids.w1]: '1', [ids.w2]: '2' });
  });
});

describe('reconciliation', () => {
  it('reports no differences after normal operation and detects a tampered stock level', async () => {
    const clean = await api(tokens.adminA).get('/inventory/reconciliation');
    expect(clean.status).toBe(200);
    expect(clean.body.data.differences).toEqual([]);
    expect(clean.body.data.balancesChecked).toBeGreaterThan(0);

    const productId = await newProduct();
    await entry(productId, '5');
    await getDatabase().collection(STOCK_LEVELS_COLLECTION).updateOne(
      { tenantId: 'tenant-a', productId, warehouseId: ids.w1 },
      { $set: { quantity: Decimal128.fromString('7') } },
    );

    const tampered = await api(tokens.adminA).get('/inventory/reconciliation');
    expect(tampered.body.data.differences).toEqual([{ productId, warehouseId: ids.w1, lotId: null, expected: '5', actual: '7' }]);
    // Solo reporta: no corrige.
    expect(await storedStock(productId)).toBe('7');

    await getDatabase().collection(STOCK_LEVELS_COLLECTION).updateOne(
      { tenantId: 'tenant-a', productId, warehouseId: ids.w1 },
      { $set: { quantity: Decimal128.fromString('5') } },
    );
  });
});

describe('immutability', () => {
  it('has no repository method that updates or deletes a movement', () => {
    const methods = Object.getOwnPropertyNames(InventoryMovementsRepository.prototype);
    expect(methods.filter((name) => /update|delete|remove|replace|set|save|upsert/i.test(name))).toEqual([]);
  });

  it('exposes no route that updates or deletes a movement', async () => {
    const methods = listRoutes(inventoryRoutes())
      .filter((route) => route.split(' ')[1].startsWith('/movements'))
      .map((route) => route.split(' ')[0]);
    expect([...new Set(methods)].sort()).toEqual(['get', 'post']);

    const productId = await newProduct();
    const movement = await entry(productId, '1');
    expect((await api(tokens.adminA).patch(`/inventory/movements/${movement.id}`, { quantity: '9' })).status).toBe(404);
    expect((await api(tokens.adminA).put(`/inventory/movements/${movement.id}`, { quantity: '9' })).status).toBe(404);
    expect((await api(tokens.adminA).delete(`/inventory/movements/${movement.id}`)).status).toBe(404);
    expect((await api(tokens.adminA).get(`/inventory/movements/${movement.id}`)).body.data.quantity).toBe('1');
  });
});

describe('tenant isolation', () => {
  it('does not let tenant B read, move, reverse or query tenant A inventory', async () => {
    const productId = await newProduct();
    const movement = await entry(productId, '3');
    const asB = api(tokens.adminB);

    expect((await asB.get(`/inventory/movements/${movement.id}`)).status).toBe(404);
    expect((await asB.post(`/inventory/movements/${movement.id}/reverse`)).status).toBe(404);
    expect((await asB.get(`/inventory/kardex/${productId}`)).status).toBe(404);
    expect((await asB.get(`/inventory/lots?productId=${productId}`)).status).toBe(404);
    expect((await asB.post('/inventory/movements', { type: 'exit', productId, warehouseId: ids.w1, quantity: '1' })).status).toBe(404);
    expect((await asB.post('/inventory/transfers', { productId, fromWarehouseId: ids.w1, toWarehouseId: ids.w2, quantity: '1' })).status).toBe(404);
    expect((await asB.get(`/inventory/stock?productId=${productId}`)).body.data.total).toBe(0);
    expect((await asB.get('/inventory/reconciliation')).body.data.balancesChecked).toBe(0);

    expect(await storedStock(productId)).toBe('3');
    expect(await movementCount('tenant-b')).toBe(0);
  });
});

describe('permissions', () => {
  const id = randomUUID();
  // [método, ruta, rol que NO tiene el permiso]. Cubre todas las rutas del módulo (ver prueba siguiente).
  const forbidden: [string, string, keyof typeof tokens][] = [
    ['post', '/movements', 'viewerA'],
    ['post', `/movements/${id}/reverse`, 'viewerA'],
    ['post', '/transfers', 'viewerA'],
    ['post', '/lots', 'viewerA'],
    ['get', '/settings', 'managerA'],
    ['put', '/settings', 'managerA'],
    ['get', '/reconciliation', 'managerA'],
  ];
  // Rutas de lectura: todos los roles tienen `read` en la matriz de la 1A, así que ninguno recibe 403.
  const readableByAll: [string, string][] = [
    ['get', `/movements/${id}`],
    ['get', '/stock'],
    ['get', `/kardex/${id}`],
    ['get', `/lots?productId=${id}`],
  ];

  it.each(forbidden)('%s %s → 403 for a role without the permission', async (method, path, role) => {
    const client = api(tokens[role]) as unknown as Record<string, (path: string, body?: object) => Promise<{ status: number; body: Json }>>;
    const response = await client[method](`/inventory${path}`, {});
    expect(response.status).toBe(403);
    expect((response.body.error as Json).code).toBe('FORBIDDEN');
  });

  it.each(readableByAll)('%s %s is readable by a viewer', async (_method, path) => {
    expect((await api(tokens.viewerA).get(`/inventory${path}`)).status).not.toBe(403);
  });

  it('covers every inventory route', () => {
    const routes = listRoutes(inventoryRoutes());
    const normalize = (path: string) => path.replace(id, ':id').replace(/\?.*$/, '').replace('/kardex/:id', '/kardex/:productId');
    const covered = [...forbidden, ...readableByAll].map(([method, path]) => `${method} ${normalize(path)}`);
    expect([...new Set(covered)].sort()).toEqual(routes.sort());
  });

  it('requires authentication', async () => {
    expect((await api('invalid').get('/inventory/stock')).status).toBe(401);
  });
});
