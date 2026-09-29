import { randomUUID } from 'node:crypto';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { getDatabase } from '../../config/database';
import { auditRepository } from '../../core/audit';
import { api, createUserAndLogin, listRoutes, startDatabase, stopDatabase } from '../../test/helpers';
import { CATALOG_RESOURCES, catalogsRoutes } from './catalogs.routes';

let replSet: MongoMemoryReplSet;
const tokens: Record<'adminA' | 'adminB' | 'userA' | 'viewerA', string> = { adminA: '', adminB: '', userA: '', viewerA: '' };

beforeAll(async () => {
  replSet = await startDatabase();
  tokens.adminA = await createUserAndLogin('admin-a@example.com', 'admin', 'tenant-a');
  tokens.adminB = await createUserAndLogin('admin-b@example.com', 'admin', 'tenant-b');
  tokens.userA = await createUserAndLogin('user-a@example.com', 'user', 'tenant-a');
  tokens.viewerA = await createUserAndLogin('viewer-a@example.com', 'viewer', 'tenant-a');
}, 120_000);

afterAll(async () => {
  await stopDatabase(replSet);
});

async function create(resource: string, body: object, token = tokens.adminA) {
  const response = await api(token).post(`/catalogs/${resource}`, body);
  if (response.status !== 201) throw new Error(`POST ${resource} → ${response.status} ${JSON.stringify(response.body)}`);
  return response.body.data as { id: string } & Record<string, unknown>;
}

describe('catalog CRUD', () => {
  it('creates, reads, updates, lists and soft-deletes a unit', async () => {
    const unit = await create('units', { code: 'KG', name: 'Kilogramo', decimals: 3 });
    expect(unit).toMatchObject({ code: 'KG', decimals: 3, tenantId: 'tenant-a', custom: {}, deletedAt: null });

    const read = await api(tokens.adminA).get(`/catalogs/units/${unit.id}`);
    expect(read.status).toBe(200);

    const updated = await api(tokens.adminA).patch(`/catalogs/units/${unit.id}`, { name: 'Kilo', custom: { sat: 'KGM' } });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ name: 'Kilo', code: 'KG', custom: { sat: 'KGM' } });

    expect((await api(tokens.adminA).delete(`/catalogs/units/${unit.id}`)).status).toBe(204);
    expect((await api(tokens.adminA).get(`/catalogs/units/${unit.id}`)).status).toBe(404);
    const stored = await getDatabase().collection('units').findOne({ _id: unit.id as never });
    expect(stored?.deletedAt).toBeInstanceOf(Date);
  });

  it('paginates', async () => {
    for (let i = 1; i <= 5; i++) await create('warehouses', { code: `PAG-${i}`, name: `Almacén ${i}` });
    const page = await api(tokens.adminA).get('/catalogs/warehouses?page=2&pageSize=2&q=PAG-');
    expect(page.status).toBe(200);
    expect(page.body.data).toMatchObject({ page: 2, pageSize: 2, total: 5 });
    expect(page.body.data.items.map((warehouse: { code: string }) => warehouse.code)).toEqual(['PAG-3', 'PAG-4']);
  });

  it('searches products, customers and suppliers as literal text', async () => {
    const unit = await create('units', { code: 'PZA', name: 'Pieza', decimals: 0 });
    await create('products', { sku: 'TOR-001', name: 'Tornillo (acero)', type: 'good', unitId: unit.id });
    await create('products', { sku: 'TUE-001', name: 'Tuerca', type: 'good', unitId: unit.id });
    await create('customers', { code: 'C-1', legalName: 'Comercial del Norte SA', taxId: 'CNO010101AAA' });
    await create('suppliers', { code: 'P-1', legalName: 'Aceros del Sur', taxId: 'ASU020202BBB' });

    const products = await api(tokens.adminA).get('/catalogs/products?q=' + encodeURIComponent('(acero)'));
    expect(products.body.data.items.map((product: { sku: string }) => product.sku)).toEqual(['TOR-001']);
    const bySku = await api(tokens.adminA).get('/catalogs/products?q=tue');
    expect(bySku.body.data.items.map((product: { sku: string }) => product.sku)).toEqual(['TUE-001']);
    const customers = await api(tokens.adminA).get('/catalogs/customers?q=norte');
    expect(customers.body.data.total).toBe(1);
    const suppliers = await api(tokens.adminA).get('/catalogs/suppliers?q=ASU02');
    expect(suppliers.body.data.total).toBe(1);
    const regexInjection = await api(tokens.adminA).get('/catalogs/products?q=' + encodeURIComponent('.*'));
    expect(regexInjection.body.data.total).toBe(0);
  });

  it('stores money and tax rates as Decimal128 and returns them as exact strings', async () => {
    const unit = await create('units', { code: 'LT', name: 'Litro', decimals: 2 });
    const tax = await create('taxes', { code: 'IVA16', name: 'IVA 16%', rate: '0.16', type: 'transfer' });
    const currency = await create('currencies', { code: 'mxn', name: 'Peso mexicano', symbol: '$' });
    const product = await create('products', {
      sku: 'ACE-1', name: 'Aceite', type: 'good', unitId: unit.id, taxIds: [tax.id], currencyId: currency.id,
      cost: '10.10', salePrice: '19.99',
    });
    expect(currency.code).toBe('MXN');
    expect(tax.rate).toBe('0.16');
    expect(product).toMatchObject({ cost: '10.1', salePrice: '19.99', taxIds: [tax.id] });

    const stored = await getDatabase().collection('products').findOne({ _id: product.id as never });
    expect(stored?.salePrice?._bsontype).toBe('Decimal128');
    expect(stored?.salePrice?.toString()).toBe('19.99');
  });

  it('rejects numbers for money, duplicated codes and unknown references', async () => {
    const unit = await create('units', { code: 'CJ', name: 'Caja', decimals: 0 });
    const asNumber = await api(tokens.adminA).post('/catalogs/products', { sku: 'N-1', name: 'X', type: 'good', unitId: unit.id, cost: 10.5 });
    expect(asNumber.status).toBe(400);

    const duplicate = await api(tokens.adminA).post('/catalogs/units', { code: 'CJ', name: 'Otra', decimals: 0 });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('UNIT_ALREADY_EXISTS');

    await create('products', { sku: 'DUP-1', name: 'Uno', type: 'good', unitId: unit.id });
    const duplicateSku = await api(tokens.adminA).post('/catalogs/products', { sku: 'DUP-1', name: 'Dos', type: 'good', unitId: unit.id });
    expect(duplicateSku.body.error.code).toBe('PRODUCT_ALREADY_EXISTS');

    const unknownUnit = await api(tokens.adminA).post('/catalogs/products', { sku: 'U-1', name: 'X', type: 'good', unitId: randomUUID() });
    expect(unknownUnit.status).toBe(400);
    expect(unknownUnit.body.error.code).toBe('INVALID_REFERENCE');
  });

  it('keeps product type, tracking and unit immutable, and services untracked', async () => {
    const unit = await create('units', { code: 'SRV', name: 'Servicio', decimals: 0 });
    const trackedService = await api(tokens.adminA).post('/catalogs/products', {
      sku: 'S-1', name: 'Instalación', type: 'service', tracking: 'lot', unitId: unit.id,
    });
    expect(trackedService.status).toBe(400);

    const product = await create('products', { sku: 'IMM-1', name: 'Fijo', type: 'good', unitId: unit.id });
    const change = await api(tokens.adminA).patch(`/catalogs/products/${product.id}`, { tracking: 'serial' });
    expect(change.status).toBe(400);
  });

  it('manages the category hierarchy and prevents cycles and deleting used categories', async () => {
    const root = await create('product-categories', { name: 'Ferretería' });
    const child = await create('product-categories', { name: 'Tornillería', parentId: root.id });
    const cycle = await api(tokens.adminA).patch(`/catalogs/product-categories/${root.id}`, { parentId: child.id });
    expect(cycle.status).toBe(409);
    expect(cycle.body.error.code).toBe('CATEGORY_CYCLE');

    const withChildren = await api(tokens.adminA).delete(`/catalogs/product-categories/${root.id}`);
    expect(withChildren.status).toBe(409);
    expect(withChildren.body.error.code).toBe('CATEGORY_IN_USE');
  });

  it('does not delete a unit used by a product', async () => {
    const unit = await create('units', { code: 'USED', name: 'Usada', decimals: 0 });
    await create('products', { sku: 'USE-1', name: 'Usa la unidad', type: 'good', unitId: unit.id });
    const response = await api(tokens.adminA).delete(`/catalogs/units/${unit.id}`);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('UNIT_IN_USE');
  });
});

describe('audit', () => {
  it('records who created, updated and deleted a catalog record, with before and after', async () => {
    const warehouse = await create('warehouses', { code: 'AUD-1', name: 'Auditado' });
    await api(tokens.adminA).patch(`/catalogs/warehouses/${warehouse.id}`, { name: 'Auditado 2' });
    await api(tokens.adminA).delete(`/catalogs/warehouses/${warehouse.id}`);

    const entries = await auditRepository(getDatabase()).findByEntity('tenant-a', 'warehouse', warehouse.id);
    expect(entries.map((entry) => entry.action)).toEqual(['create', 'update', 'delete']);
    const adminId = (await getDatabase().collection<{ _id: string }>('users').findOne({ email: 'admin-a@example.com' }))?._id;
    expect(entries.every((entry) => entry.actorId === adminId && entry.tenantId === 'tenant-a')).toBe(true);
    expect(entries[1]).toMatchObject({ before: { name: 'Auditado' }, after: { name: 'Auditado 2' } });
    expect(entries[2].after).toBeNull();
  });

  it('audits every catalog entity', async () => {
    const unit = await create('units', { code: 'AUD-U', name: 'U', decimals: 0 });
    const records = {
      unit,
      tax: await create('taxes', { code: 'AUD-T', name: 'T', rate: '0', type: 'withholding' }),
      currency: await create('currencies', { code: 'AUD', name: 'Dólar australiano', symbol: 'A$' }),
      category: await create('product-categories', { name: 'Auditada' }),
      product: await create('products', { sku: 'AUD-P', name: 'P', type: 'good', unitId: unit.id }),
      customer: await create('customers', { code: 'AUD-C', legalName: 'C' }),
      supplier: await create('suppliers', { code: 'AUD-S', legalName: 'S' }),
      warehouse: await create('warehouses', { code: 'AUD-W', name: 'W' }),
    };
    const audit = auditRepository(getDatabase());
    for (const [entity, record] of Object.entries(records)) {
      expect((await audit.findByEntity('tenant-a', entity, record.id)).map((entry) => entry.action)).toEqual(['create']);
    }
  });
});

describe('tenant isolation', () => {
  it('does not let tenant B read, list, update or delete tenant A records', async () => {
    const unit = await create('units', { code: 'ISO', name: 'Aislada', decimals: 0 });
    const product = await create('products', { sku: 'ISO-1', name: 'Secreto de A', type: 'good', unitId: unit.id });
    const asB = api(tokens.adminB);

    expect((await asB.get(`/catalogs/products/${product.id}`)).status).toBe(404);
    expect((await asB.patch(`/catalogs/products/${product.id}`, { name: 'Hackeado' })).status).toBe(404);
    expect((await asB.delete(`/catalogs/products/${product.id}`)).status).toBe(404);
    expect((await asB.get('/catalogs/products?q=ISO-1')).body.data.total).toBe(0);
    // Tampoco puede referenciar la unidad de A desde su propio tenant.
    const crossReference = await asB.post('/catalogs/products', { sku: 'B-1', name: 'B', type: 'good', unitId: unit.id });
    expect(crossReference.body.error.code).toBe('INVALID_REFERENCE');

    const untouched = await api(tokens.adminA).get(`/catalogs/products/${product.id}`);
    expect(untouched.body.data.name).toBe('Secreto de A');
  });

  it('ignores a tenantId sent in the body', async () => {
    const warehouse = await api(tokens.adminA).post('/catalogs/warehouses', { code: 'BODY-T', name: 'X', tenantId: 'tenant-b' });
    expect(warehouse.body.data.tenantId).toBe('tenant-a');
  });
});

describe('permissions', () => {
  const someId = randomUUID();

  it('requires authentication', async () => {
    const response = await api('not-a-token').get('/catalogs/units');
    expect(response.status).toBe(401);
  });

  it.each(Object.keys(CATALOG_RESOURCES))('forbids writes on /catalogs/%s to roles without the permission', async (resource) => {
    const viewer = api(tokens.viewerA);
    expect((await viewer.post(`/catalogs/${resource}`, {})).status).toBe(403);
    expect((await viewer.patch(`/catalogs/${resource}/${someId}`, {})).status).toBe(403);
    expect((await viewer.delete(`/catalogs/${resource}/${someId}`)).status).toBe(403);
    // El rol `user` crea pero no modifica ni borra.
    expect((await api(tokens.userA).patch(`/catalogs/${resource}/${someId}`, {})).status).toBe(403);
    expect((await api(tokens.userA).delete(`/catalogs/${resource}/${someId}`)).status).toBe(403);
    // Lectura: todos los roles tienen `read` en la matriz de la 1A.
    expect((await viewer.get(`/catalogs/${resource}`)).status).toBe(200);
  });

  it('guards every catalog route (the table above covers all of them)', () => {
    const expected = Object.keys(CATALOG_RESOURCES).flatMap((resource) => [
      `get /${resource}`, `get /${resource}/:id`, `post /${resource}`, `patch /${resource}/:id`, `delete /${resource}/:id`,
    ]);
    expect(listRoutes(catalogsRoutes()).sort()).toEqual(expected.sort());
  });
});
