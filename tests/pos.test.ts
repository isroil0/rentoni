import { describe, expect, it } from 'vitest';
import { API, app, as, createAdmin, createCatalogue, createCustomer, prisma, request, stockOf } from './helpers';

describe('POS', () => {
  it('searches the catalogue by name, SKU and barcode', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'POS-W-M', stock: 12, productName: 'Oxford Classic Shirt' });
    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: fixture.variantId } });

    for (const query of ['Oxford', 'POS-W-M', variant.barcode!]) {
      const res = await request(app())
        .get(`${API}/admin/pos/search?q=${encodeURIComponent(query)}`)
        .set(as(admin))
        .expect(200);
      const hit = res.body.data.find((r: { variantId: number }) => r.variantId === fixture.variantId);
      expect(hit, `search for ${query}`).toBeTruthy();
      expect(hit.price).toBe(30);
      expect(hit.quantity).toBe(12);
      expect(hit.stockStatus).toBe('IN_STOCK');
    }
  });

  it('quotes totals server-side without writing anything', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'QUOTE-W-M', stock: 10, sellingPrice: 30 });

    const res = await request(app())
      .post(`${API}/admin/pos/quote`)
      .set(as(admin))
      .send({ items: [{ variantId: fixture.variantId, quantity: 2 }] })
      .expect(200);

    expect(res.body.data.subtotal).toBe(60);
    expect(res.body.data.discount).toBe(0);
    expect(res.body.data.total).toBe(60);
    expect(res.body.data.canComplete).toBe(true);
    expect(await stockOf(fixture.variantId)).toBe(10);
    expect(await prisma.order.count()).toBe(0);
  });

  it('completes a counter sale in one step and moves stock exactly once', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'SALE-W-M', stock: 20, sellingPrice: 30 });

    const res = await request(app())
      .post(`${API}/admin/pos/orders`)
      .set(as(admin))
      .send({
        items: [{ variantId: fixture.variantId, quantity: 2 }],
        paymentMethod: 'CASH',
        completeNow: true,
      })
      .expect(201);

    const order = res.body.data;
    expect(order.source).toBe('POS');
    expect(order.status).toBe('COMPLETED');
    expect(order.paymentStatus).toBe('PAID');
    expect(order.paymentMethod).toBe('CASH');
    expect(order.orderNumber).toMatch(/^POS-\d{8}-\d{5}$/);
    expect(order.subtotal).toBe(60);
    expect(order.total).toBe(60);
    // POS sales may be anonymous.
    expect(order.customerId).toBeNull();

    expect(await stockOf(fixture.variantId)).toBe(18);
    const txns = await prisma.inventoryTransaction.findMany({
      where: { referenceType: 'ORDER', referenceId: order.id },
    });
    expect(txns).toHaveLength(1);
    expect(txns[0]).toMatchObject({ type: 'SALE', quantity: -2, previousQuantity: 20, newQuantity: 18 });
  });

  it('holds a pending ticket without touching stock until it is completed', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'TICKET-W-M', stock: 10 });

    const created = await request(app())
      .post(`${API}/admin/pos/orders`)
      .set(as(admin))
      .send({ items: [{ variantId: fixture.variantId, quantity: 3 }] })
      .expect(201);
    expect(created.body.data.status).toBe('PENDING');
    expect(created.body.data.stockCommitted).toBe(false);
    expect(await stockOf(fixture.variantId)).toBe(10);

    const completed = await request(app())
      .post(`${API}/admin/pos/orders/${created.body.data.id}/complete`)
      .set(as(admin))
      .send({ paymentMethod: 'CARD' })
      .expect(200);
    expect(completed.body.data.status).toBe('COMPLETED');
    expect(await stockOf(fixture.variantId)).toBe(7);

    // Completing again is rejected and does not double-deduct.
    const again = await request(app())
      .post(`${API}/admin/pos/orders/${created.body.data.id}/complete`)
      .set(as(admin))
      .send({})
      .expect(409);
    expect(again.body.error.code).toBe('ORDER_ALREADY_COMPLETED');
    expect(await stockOf(fixture.variantId)).toBe(7);
  });

  it('calculates line and order discounts server-side', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'DISC-W-M', stock: 10, sellingPrice: 30 });

    const lineDiscount = await request(app())
      .post(`${API}/admin/pos/orders`)
      .set(as(admin))
      .send({ items: [{ variantId: fixture.variantId, quantity: 2, discount: 5 }], completeNow: true })
      .expect(201);
    expect(lineDiscount.body.data.subtotal).toBe(60);
    expect(lineDiscount.body.data.discount).toBe(5);
    expect(lineDiscount.body.data.total).toBe(55);

    const percent = await request(app())
      .post(`${API}/admin/pos/orders`)
      .set(as(admin))
      .send({ items: [{ variantId: fixture.variantId, quantity: 2 }], discountPercent: 10, completeNow: true })
      .expect(201);
    expect(percent.body.data.subtotal).toBe(60);
    expect(percent.body.data.discount).toBe(6);
    expect(percent.body.data.total).toBe(54);
  });

  it('rejects a discount larger than the subtotal', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'BIGDISC-W-M', stock: 10, sellingPrice: 30 });

    const res = await request(app())
      .post(`${API}/admin/pos/orders`)
      .set(as(admin))
      .send({ items: [{ variantId: fixture.variantId, quantity: 1 }], discount: 100, completeNow: true })
      .expect(422);
    expect(res.body.error.code).toBe('DISCOUNT_TOO_LARGE');
    expect(await stockOf(fixture.variantId)).toBe(10);
  });

  it('rejects a sale with insufficient stock and leaves nothing behind', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'SHORT-W-M', stock: 2 });

    const res = await request(app())
      .post(`${API}/admin/pos/orders`)
      .set(as(admin))
      .send({ items: [{ variantId: fixture.variantId, quantity: 5 }], completeNow: true })
      .expect(409);

    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await stockOf(fixture.variantId)).toBe(2);
    // The order was rolled back with the stock change.
    expect(await prisma.order.count({ where: { items: { some: { variantId: fixture.variantId } } } })).toBe(0);
  });

  it('rolls back a multi-line sale when only one line is short', async () => {
    const admin = await createAdmin();
    const plenty = await createCatalogue({ sku: 'MULTI-A-M', stock: 50 });
    const scarce = await createCatalogue({ sku: 'MULTI-B-M', stock: 1 });

    await request(app())
      .post(`${API}/admin/pos/orders`)
      .set(as(admin))
      .send({
        items: [
          { variantId: plenty.variantId, quantity: 3 },
          { variantId: scarce.variantId, quantity: 4 },
        ],
        completeNow: true,
      })
      .expect(409);

    expect(await stockOf(plenty.variantId)).toBe(50);
    expect(await stockOf(scarce.variantId)).toBe(1);
  });

  it('cancels a completed sale and restores stock exactly once', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'CANCEL-W-M', stock: 10 });

    const order = await request(app())
      .post(`${API}/admin/pos/orders`)
      .set(as(admin))
      .send({ items: [{ variantId: fixture.variantId, quantity: 4 }], completeNow: true })
      .expect(201);
    expect(await stockOf(fixture.variantId)).toBe(6);

    const cancelled = await request(app())
      .post(`${API}/admin/pos/orders/${order.body.data.id}/cancel`)
      .set(as(admin))
      .send({ reason: 'Customer changed their mind' })
      .expect(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');
    expect(await stockOf(fixture.variantId)).toBe(10);

    // A second cancellation is refused, so stock cannot be inflated.
    const again = await request(app())
      .post(`${API}/admin/pos/orders/${order.body.data.id}/cancel`)
      .set(as(admin))
      .send({})
      .expect(409);
    expect(again.body.error.code).toBe('ORDER_NOT_CANCELLABLE');
    expect(await stockOf(fixture.variantId)).toBe(10);
  });

  it('adds by SKU and by barcode and merges duplicate lines', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'SCAN-W-M', stock: 10 });
    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: fixture.variantId } });

    const res = await request(app())
      .post(`${API}/admin/pos/orders`)
      .set(as(admin))
      .send({
        items: [
          { sku: 'SCAN-W-M', quantity: 1 },
          { barcode: variant.barcode, quantity: 2 },
        ],
        completeNow: true,
      })
      .expect(201);

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].quantity).toBe(3);
    expect(await stockOf(fixture.variantId)).toBe(7);
  });

  it('produces a receipt for a completed sale', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'RCPT-W-M', stock: 10, sellingPrice: 30 });

    const order = await request(app())
      .post(`${API}/admin/pos/orders`)
      .set(as(admin))
      .send({
        items: [{ variantId: fixture.variantId, quantity: 2 }],
        paymentMethod: 'CASH',
        completeNow: true,
      })
      .expect(201);

    const receipt = await request(app())
      .get(`${API}/admin/pos/orders/${order.body.data.id}/receipt`)
      .set(as(admin))
      .expect(200);

    expect(receipt.body.data).toMatchObject({
      orderNumber: order.body.data.orderNumber,
      customer: 'Walk-in',
      subtotal: 60,
      total: 60,
      paymentMethod: 'CASH',
      paymentStatus: 'PAID',
    });
    expect(receipt.body.data.items[0]).toMatchObject({ sku: 'RCPT-W-M', quantity: 2, unitPrice: 30 });
  });

  it('can attach a registered customer to a POS sale', async () => {
    const admin = await createAdmin();
    const customer = await createCustomer();
    const fixture = await createCatalogue({ sku: 'NAMED-W-M', stock: 10 });

    const res = await request(app())
      .post(`${API}/admin/pos/orders`)
      .set(as(admin))
      .send({
        items: [{ variantId: fixture.variantId, quantity: 1 }],
        customerId: customer.id,
        completeNow: true,
      })
      .expect(201);
    expect(res.body.data.customerId).toBe(customer.id);
  });

  it('refuses to sell an inactive variant', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'INACTIVE-W-M', stock: 10 });
    await prisma.productVariant.update({ where: { id: fixture.variantId }, data: { active: false } });

    const res = await request(app())
      .post(`${API}/admin/pos/orders`)
      .set(as(admin))
      .send({ items: [{ variantId: fixture.variantId, quantity: 1 }], completeNow: true })
      .expect(409);
    expect(res.body.error.code).toBe('VARIANT_INACTIVE');
  });

  it('rejects invalid quantities', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'QTY-W-M', stock: 10 });

    for (const quantity of [0, -3, 1.5]) {
      const res = await request(app())
        .post(`${API}/admin/pos/orders`)
        .set(as(admin))
        .send({ items: [{ variantId: fixture.variantId, quantity }], completeNow: true })
        .expect(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await stockOf(fixture.variantId)).toBe(10);
  });
});
