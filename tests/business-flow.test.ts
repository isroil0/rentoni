import { beforeAll, describe, expect, it } from 'vitest';
import {
  API,
  app,
  as,
  createAdmin,
  createCustomer,
  createSupplier,
  prisma,
  request,
  stockOf,
} from './helpers';

/**
 * The exact end-to-end scenario from the specification, executed through the HTTP API
 * in order. Each step asserts both the response and the resulting database state.
 */
describe('critical business flow', () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let customer: Awaited<ReturnType<typeof createCustomer>>;
  let variantId: number;
  let productId: number;
  let firstOrderId: number;

  beforeAll(async () => {
    admin = await createAdmin();
    customer = await createCustomer();
  });

  it('0. sets up Oxford Classic Shirt / White / M with SKU OXF-W-M', async () => {
    const category = await request(app())
      .post(`${API}/admin/categories`)
      .set(as(admin))
      .send({ name: 'Formal Shirts', description: 'Business shirts' })
      .expect(201);

    const product = await request(app())
      .post(`${API}/admin/products`)
      .set(as(admin))
      .send({
        categoryId: category.body.data.id,
        name: 'Oxford Classic Shirt',
        description: 'Timeless button-down Oxford',
        brand: 'Rentoni',
        images: [{ url: 'https://cdn.test/oxford.jpg', altText: 'Oxford Classic', isPrimary: true }],
        variants: [
          {
            sku: 'OXF-W-M',
            color: 'White',
            size: 'M',
            costPrice: 18,
            sellingPrice: 30,
            minimumStock: 5,
          },
        ],
      })
      .expect(201);

    productId = product.body.data.id;
    variantId = product.body.data.variants[0].id;

    expect(product.body.data.variants[0]).toMatchObject({
      sku: 'OXF-W-M',
      color: 'White',
      size: 'M',
      costPrice: 18,
      sellingPrice: 30,
      minimumStock: 5,
      quantity: 0,
    });
  });

  it('1. receives a purchase of 20 units → stock 20', async () => {
    const supplier = await createSupplier('Atlas Textile Co.');

    const purchase = await request(app())
      .post(`${API}/admin/purchases`)
      .set(as(admin))
      .send({ supplierId: supplier.id, items: [{ variantId, quantity: 20, unitCost: 18 }] })
      .expect(201);
    expect(purchase.body.data.totalCost).toBe(360);

    const received = await request(app())
      .post(`${API}/admin/purchases/${purchase.body.data.id}/receive`)
      .set(as(admin))
      .expect(200);
    expect(received.body.data.status).toBe('RECEIVED');

    expect(await stockOf(variantId)).toBe(20);
    const tx = await prisma.inventoryTransaction.findFirstOrThrow({
      where: { variantId, type: 'PURCHASE' },
    });
    expect(tx).toMatchObject({ quantity: 20, previousQuantity: 0, newQuantity: 20 });
  });

  it('2. POS sale of 3 → stock 20 → 17, transaction created', async () => {
    const sale = await request(app())
      .post(`${API}/admin/pos/orders`)
      .set(as(admin))
      .send({ items: [{ variantId, quantity: 3 }], paymentMethod: 'CASH', completeNow: true })
      .expect(201);

    expect(sale.body.data.status).toBe('COMPLETED');
    expect(sale.body.data.subtotal).toBe(90);
    expect(sale.body.data.total).toBe(90);

    expect(await stockOf(variantId)).toBe(17);
    const tx = await prisma.inventoryTransaction.findFirstOrThrow({
      where: { variantId, type: 'SALE', referenceId: sale.body.data.id },
    });
    expect(tx).toMatchObject({ quantity: -3, previousQuantity: 20, newQuantity: 17 });
  });

  it('3. online order of 2 → stock 17 → 15, transaction created', async () => {
    const order = await request(app())
      .post(`${API}/customer/orders`)
      .set(as(customer))
      .send({ items: [{ variantId, quantity: 2 }] })
      .expect(201);

    firstOrderId = order.body.data.id;
    expect(order.body.data.source).toBe('ONLINE');
    expect(order.body.data.total).toBe(60);
    expect(order.body.data.items[0].unitPrice).toBe(30);

    expect(await stockOf(variantId)).toBe(15);
    const tx = await prisma.inventoryTransaction.findFirstOrThrow({
      where: { variantId, type: 'SALE', referenceId: firstOrderId },
    });
    expect(tx).toMatchObject({ quantity: -2, previousQuantity: 17, newQuantity: 15 });
  });

  it('4. the storefront shows IN_STOCK without leaking cost price', async () => {
    const res = await request(app()).get(`${API}/products/${productId}`).expect(200);

    expect(res.body.data.variants[0]).toMatchObject({
      sku: 'OXF-W-M',
      color: 'White',
      size: 'M',
      price: 30,
      availability: 'IN_STOCK',
    });
    expect(res.body.data.availability).toBe('IN_STOCK');
    expect(JSON.stringify(res.body)).not.toContain('costPrice');
    expect(res.body.data.variants[0]).not.toHaveProperty('quantity');
  });

  it('5. selling 16 fails and stock stays at 15', async () => {
    const res = await request(app())
      .post(`${API}/admin/pos/orders`)
      .set(as(admin))
      .send({ items: [{ variantId, quantity: 16 }], completeNow: true })
      .expect(409);

    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.error.message).toBe('Not enough stock for this product variant.');
    expect(res.body.error.details).toMatchObject({ available: 15, requested: 16 });
    expect(await stockOf(variantId)).toBe(15);
  });

  it('6. returning 1 unit → stock 15 → 16, transaction created', async () => {
    // The online order must be fulfilled before it can be returned against.
    await request(app())
      .post(`${API}/admin/orders/${firstOrderId}/status`)
      .set(as(admin))
      .send({ status: 'COMPLETED' })
      .expect(200);

    const ret = await request(app())
      .post(`${API}/admin/returns`)
      .set(as(admin))
      .send({ orderId: firstOrderId, items: [{ variantId, quantity: 1 }], reason: 'Wrong size' })
      .expect(201);

    expect(ret.body.data[0].status).toBe('ACCEPTED');
    expect(await stockOf(variantId)).toBe(16);

    const tx = await prisma.inventoryTransaction.findFirstOrThrow({
      where: { variantId, type: 'RETURN', referenceId: ret.body.data[0].id },
    });
    expect(tx).toMatchObject({ quantity: 1, previousQuantity: 15, newQuantity: 16 });
  });

  it('7. a price change to $35 leaves historical orders at $30', async () => {
    await request(app())
      .put(`${API}/admin/variants/${variantId}`)
      .set(as(admin))
      .send({ sellingPrice: 35 })
      .expect(200);

    const historical = await request(app())
      .get(`${API}/customer/orders/${firstOrderId}`)
      .set(as(customer))
      .expect(200);
    expect(historical.body.data.items[0].unitPrice).toBe(30);
    expect(historical.body.data.total).toBe(60);

    const storefront = await request(app()).get(`${API}/products/${productId}`).expect(200);
    expect(storefront.body.data.variants[0].price).toBe(35);

    const audited = await prisma.auditLog.findFirst({
      where: { action: 'PRICE_CHANGED', entityId: String(variantId) },
    });
    expect(JSON.parse(audited!.oldValue!).sellingPrice).toBe(30);
    expect(JSON.parse(audited!.newValue!).sellingPrice).toBe(35);
  });

  it('8. stock set to 5 reports LOW_STOCK', async () => {
    await request(app())
      .post(`${API}/admin/inventory/adjust`)
      .set(as(admin))
      .send({ variantId, setQuantity: 5, note: 'Stock count' })
      .expect(200);

    const admin_view = await request(app())
      .get(`${API}/admin/inventory/${variantId}`)
      .set(as(admin))
      .expect(200);
    expect(admin_view.body.data).toMatchObject({ quantity: 5, minimumStock: 5, status: 'LOW_STOCK' });

    const storefront = await request(app()).get(`${API}/products/${productId}`).expect(200);
    expect(storefront.body.data.variants[0].availability).toBe('LOW_STOCK');
    expect(storefront.body.data.variants[0].inStock).toBe(true);
  });

  it('9. stock set to 0 reports OUT_OF_STOCK', async () => {
    await request(app())
      .post(`${API}/admin/inventory/adjust`)
      .set(as(admin))
      .send({ variantId, setQuantity: 0, note: 'Sold out' })
      .expect(200);

    const admin_view = await request(app())
      .get(`${API}/admin/inventory/${variantId}`)
      .set(as(admin))
      .expect(200);
    expect(admin_view.body.data.status).toBe('OUT_OF_STOCK');

    const storefront = await request(app()).get(`${API}/products/${productId}`).expect(200);
    expect(storefront.body.data.variants[0].availability).toBe('OUT_OF_STOCK');
    expect(storefront.body.data.variants[0].inStock).toBe(false);

    const outList = await request(app())
      .get(`${API}/admin/inventory/out-of-stock`)
      .set(as(admin))
      .expect(200);
    expect(outList.body.data.map((r: { variantId: number }) => r.variantId)).toContain(variantId);
  });

  it('10. with stock 1, two simultaneous purchases leave stock at 0 — one wins, one fails', async () => {
    await request(app())
      .post(`${API}/admin/inventory/adjust`)
      .set(as(admin))
      .send({ variantId, setQuantity: 1, note: 'Restock one unit' })
      .expect(200);
    expect(await stockOf(variantId)).toBe(1);

    const buyerA = await createCustomer();
    const buyerB = await createCustomer();

    const [a, b] = await Promise.all([
      request(app())
        .post(`${API}/customer/orders`)
        .set({ Authorization: `Bearer ${buyerA.token}` })
        .send({ items: [{ variantId, quantity: 1 }] }),
      request(app())
        .post(`${API}/customer/orders`)
        .set({ Authorization: `Bearer ${buyerB.token}` })
        .send({ items: [{ variantId, quantity: 1 }] }),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect([a, b].find((r) => r.status === 409)!.body.error.code).toBe('INSUFFICIENT_STOCK');

    const finalStock = await stockOf(variantId);
    expect(finalStock).toBe(0);
    expect(finalStock).toBeGreaterThanOrEqual(0);
  });

  it('closes with a consistent inventory ledger and a complete audit trail', async () => {
    const txns = await prisma.inventoryTransaction.findMany({
      where: { variantId },
      orderBy: { id: 'asc' },
    });

    // Signed movements sum to the current quantity and chain row by row.
    expect(txns.reduce((sum, t) => sum + t.quantity, 0)).toBe(await stockOf(variantId));
    for (let i = 0; i < txns.length; i += 1) {
      const t = txns[i]!;
      expect(t.newQuantity).toBe(t.previousQuantity + t.quantity);
      expect(t.newQuantity).toBeGreaterThanOrEqual(0);
      if (i > 0) expect(t.previousQuantity).toBe(txns[i - 1]!.newQuantity);
    }

    // Every transaction type used along the way is represented.
    const types = new Set(txns.map((t) => t.type));
    expect(types).toContain('PURCHASE');
    expect(types).toContain('SALE');
    expect(types).toContain('RETURN');
    expect(types).toContain('ADJUSTMENT_OUT');

    const actions = new Set(
      (await prisma.auditLog.findMany({ select: { action: true } })).map((a) => a.action),
    );
    for (const action of [
      'PRODUCT_CREATED',
      'PURCHASE_RECEIVED',
      'ORDER_COMPLETED',
      'ORDER_CREATED',
      'RETURN_ACCEPTED',
      'PRICE_CHANGED',
      'INVENTORY_ADJUSTED',
      'ORDER_STATUS_CHANGED',
    ]) {
      expect(actions, `audit action ${action}`).toContain(action);
    }

    // Audit entries never contain credentials.
    const logs = await prisma.auditLog.findMany();
    const serialised = JSON.stringify(logs);
    expect(serialised).not.toContain('passwordHash');
    expect(serialised).not.toContain('Admin@12345');
  });

  it('reports the flow correctly on the dashboard', async () => {
    const res = await request(app())
      .get(`${API}/admin/dashboard/summary?preset=today`)
      .set(as(admin))
      .expect(200);

    const data = res.body.data;
    expect(data.sales.orders).toBeGreaterThan(0);
    expect(data.sales.itemsSold).toBeGreaterThan(0);
    expect(data.sales.revenue).toBeGreaterThan(0);
    expect(data.sales.profit).toBe(
      Math.round((data.sales.revenue - data.sales.costOfGoods) * 100) / 100,
    );
    expect(data.inventory.outOfStockVariants).toBeGreaterThanOrEqual(1);
    expect(data.customers.total).toBeGreaterThanOrEqual(3);
    expect(data.operations.returns).toBe(1);
    expect(data.operations.purchasesReceived).toBe(1);
  });
});
