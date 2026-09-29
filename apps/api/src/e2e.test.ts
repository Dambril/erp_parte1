import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { ApiClient } from '@erp/api-client';
import { createApp } from './app';
import { createUserAndLogin, startDatabase, stopDatabase, testConfig } from './test/helpers';

let replSet: MongoMemoryReplSet;
let server: Server;
let client: ApiClient;

beforeAll(async () => {
  replSet = await startDatabase();
  const accessToken = await createUserAndLogin('admin@example.com', 'admin', 'tenant-e2e');
  server = createApp(testConfig).listen(0);
  client = new ApiClient({ baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, accessToken });
}, 120_000);

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await stopDatabase(replSet);
});

/** Criterio de terminado de la fase 1B, recorrido con el cliente tipado de `@erp/api-client` sobre HTTP real. */
it('runs the phase 1B acceptance flow through the typed API client', async () => {
  const unit = await client.catalogs.create('units', { code: 'PZA', name: 'Pieza', decimals: 0 });
  const tax = await client.catalogs.create('taxes', { code: 'IVA16', name: 'IVA 16%', rate: '0.16', type: 'transfer' });
  const category = await client.catalogs.create('product-categories', { name: 'Ferretería' });
  const product = await client.catalogs.create('products', {
    sku: 'MAR-01', name: 'Martillo', type: 'good', unitId: unit.id, categoryId: category.id, taxIds: [tax.id],
    cost: '85.50', salePrice: '129.90',
  });
  const central = await client.catalogs.create('warehouses', { code: 'CEN', name: 'Central' });
  const branch = await client.catalogs.create('warehouses', { code: 'SUC', name: 'Sucursal' });
  const supplier = await client.catalogs.create('suppliers', { code: 'PRV-1', legalName: 'Herramientas SA' });
  expect(supplier.legalName).toBe('Herramientas SA');

  const entry = await client.inventory.recordMovement({
    type: 'entry', productId: product.id, warehouseId: central.id, quantity: '20', reference: { type: 'manual', id: supplier.code },
  });
  expect(entry).toMatchObject({ type: 'entry', quantity: '20', unitCost: '85.5' });
  const exit = await client.inventory.recordMovement({ type: 'exit', productId: product.id, warehouseId: central.id, quantity: '3' });
  const transfer = await client.inventory.transfer({
    productId: product.id, fromWarehouseId: central.id, toWarehouseId: branch.id, quantity: '5',
  });
  expect(transfer.out.transferId).toBe(transfer.transferId);

  const stock = await client.inventory.stock({ productId: product.id });
  const byWarehouse = Object.fromEntries(stock.items.map((level) => [level.warehouseId, level.quantity]));
  expect(byWarehouse).toEqual({ [central.id]: '12', [branch.id]: '5' });

  const kardex = await client.inventory.kardex(product.id, { warehouseId: central.id });
  expect(kardex.items.map((item) => item.balance)).toEqual(['20', '17', '12']);

  const [reversal] = await client.inventory.reverseMovement(exit.id, 'salida duplicada');
  expect(reversal.reversedMovementId).toBe(exit.id);
  expect((await client.inventory.stock({ productId: product.id, warehouseId: central.id })).items[0].quantity).toBe('15');
  await expect(client.inventory.reverseMovement(exit.id)).rejects.toMatchObject({ status: 409, code: 'MOVEMENT_ALREADY_REVERSED' });

  const report = await client.inventory.reconciliation();
  expect(report.differences).toEqual([]);
  expect(report.balancesChecked).toBe(2);
});
