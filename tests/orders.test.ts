import { describe, expect, it } from 'vitest';
import { API, app, as, createAdmin, createCatalogue, createCustomer, prisma, request, stockOf } from './helpers';

describe('online customer orders', () => {
  it('creates an order, prices it from the database and deducts stock atomically', async () => {
    const customer = await createCustomer();
    const fixture = await createCatalogue({ sku: 'ON-W-M', stock: 17, sellingPrice: 30 });

    const res = await request(app())
      .post(`${API}/customer/orders`)
      .set(as(customer))
      .send({ items: [{ variantId: fixture.variantId, quantity: 2 }] })
      .expect(201);

    const order = res.body.data;
    expect(order.source).toBe('ONLINE');
    expect(order.status).toBe('PENDING');
    expect(order.orderNumber).toMatch(/^SO-\d{8}-\d{5}$/);
    expect(order.subtotal).toBe(60);
    expect(order.total).toBe(60);
    expect(order.items[0].unitPrice).toBe(30);

    expect(await stockOf(fixture.variantId)).toBe(15);
    const tx = await prisma.inventoryTransaction.findFirstOrThrow({
      where: { referenceType: 'ORDER', referenceId: order.id },
    });
    expect(tx).toMatchObject({ type: 'SALE', quantity: -2, previousQuantity: 17, newQuantity: 15 });
  });

  it('ignores any price, total or discount sent by the client', async () => {
    const customer = await createCustomer();
    const fixture = await createCatalogue({ sku: 'TRUST-W-M', stock: 10, sellingPrice: 30 });

    // Unknown fields are rejected outright by the strict schema.
    const rejected = await request(app())
      .post(`${API}/customer/orders`)
      .set(as(customer))
      .send({
        items: [{ variantId: fixture.variantId, quantity: 1, unitPrice: 1, total: 1 }],
        discount: 999,
        total: 1,
      })
      .expect(422);
    expect(rejected.body.error.code).toBe('VALIDATION_ERROR');

    // And a clean request is priced entirely from the database.
    const ok = await request(app())
      .post(`${API}/customer/orders`)
      .set(as(customer))
      .send({ items: [{ variantId: fixture.variantId, quantity: 1 }] })
      .expect(201);
    expect(ok.body.data.total).toBe(30);
    expect(ok.body.data.discount).toBe(0);
  });

  it('rejects an order that exceeds available stock without persisting anything', async () => {
    const customer = await createCustomer();
    const fixture = await createCatalogue({ sku: 'OVER-W-M', stock: 15 });

    const res = await request(app())
      .post(`${API}/customer/orders`)
      .set(as(customer))
      .send({ items: [{ variantId: fixture.variantId, quantity: 16 }] })
      .expect(409);

    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await stockOf(fixture.variantId)).toBe(15);
    expect(await prisma.order.count({ where: { customerId: customer.id } })).toBe(0);
  });

  it('keeps the original price on historical orders after a price change', async () => {
    const admin = await createAdmin();
    const customer = await createCustomer();
    const fixture = await createCatalogue({ sku: 'PRICE-W-M', stock: 10, sellingPrice: 30 });

    const order = await request(app())
      .post(`${API}/customer/orders`)
      .set(as(customer))
      .send({ items: [{ variantId: fixture.variantId, quantity: 1 }] })
      .expect(201);
    expect(order.body.data.total).toBe(30);

    await request(app())
      .put(`${API}/admin/variants/${fixture.variantId}`)
      .set(as(admin))
      .send({ sellingPrice: 35 })
      .expect(200);

    const historical = await request(app())
      .get(`${API}/customer/orders/${order.body.data.id}`)
      .set(as(customer))
      .expect(200);
    expect(historical.body.data.items[0].unitPrice).toBe(30);
    expect(historical.body.data.total).toBe(30);

    // New orders use the new price.
    const fresh = await request(app())
      .post(`${API}/customer/orders`)
      .set(as(customer))
      .send({ items: [{ variantId: fixture.variantId, quantity: 1 }] })
      .expect(201);
    expect(fresh.body.data.total).toBe(35);
  });

  it('lists only the customer’s own orders', async () => {
    const alice = await createCustomer();
    const bob = await createCustomer();
    const fixture = await createCatalogue({ sku: 'OWN-W-M', stock: 20 });

    await request(app())
      .post(`${API}/customer/orders`)
      .set(as(alice))
      .send({ items: [{ variantId: fixture.variantId, quantity: 1 }] })
      .expect(201);
    await request(app())
      .post(`${API}/customer/orders`)
      .set(as(bob))
      .send({ items: [{ variantId: fixture.variantId, quantity: 2 }] })
      .expect(201);

    const aliceOrders = await request(app()).get(`${API}/customer/orders`).set(as(alice)).expect(200);
    expect(aliceOrders.body.data).toHaveLength(1);
    expect(aliceOrders.body.data[0].items[0].quantity).toBe(1);
  });

  it('cancels an own order and returns the stock', async () => {
    const customer = await createCustomer();
    const fixture = await createCatalogue({ sku: 'CCAN-W-M', stock: 10 });

    const order = await request(app())
      .post(`${API}/customer/orders`)
      .set(as(customer))
      .send({ items: [{ variantId: fixture.variantId, quantity: 3 }] })
      .expect(201);
    expect(await stockOf(fixture.variantId)).toBe(7);

    const cancelled = await request(app())
      .post(`${API}/customer/orders/${order.body.data.id}/cancel`)
      .set(as(customer))
      .send({ reason: 'Ordered the wrong size' })
      .expect(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');
    expect(await stockOf(fixture.variantId)).toBe(10);

    const restock = await prisma.inventoryTransaction.findFirstOrThrow({
      where: { referenceType: 'ORDER_CANCELLATION', referenceId: order.body.data.id },
    });
    expect(restock).toMatchObject({ type: 'ADJUSTMENT_IN', quantity: 3, newQuantity: 10 });
  });

  it('refuses a customer cancellation after the cancellation window closes', async () => {
    const customer = await createCustomer();
    const fixture = await createCatalogue({ sku: 'WINDOW-W-M', stock: 10 });

    const order = await request(app())
      .post(`${API}/customer/orders`)
      .set(as(customer))
      .send({ items: [{ variantId: fixture.variantId, quantity: 1 }] })
      .expect(201);

    // Backdate the order beyond the default 24-hour window.
    await prisma.order.update({
      where: { id: order.body.data.id },
      data: { createdAt: new Date(Date.now() - 48 * 3600 * 1000) },
    });

    const res = await request(app())
      .post(`${API}/customer/orders/${order.body.data.id}/cancel`)
      .set(as(customer))
      .send({})
      .expect(409);
    expect(res.body.error.code).toBe('CANCEL_WINDOW_EXPIRED');
    expect(await stockOf(fixture.variantId)).toBe(9);
  });

  it('checks out from the persistent cart and empties it', async () => {
    const customer = await createCustomer();
    const a = await createCatalogue({ sku: 'CART-A-M', stock: 10, sellingPrice: 30 });
    const b = await createCatalogue({ sku: 'CART-B-M', stock: 10, sellingPrice: 42 });

    await request(app())
      .post(`${API}/customer/cart/items`)
      .set(as(customer))
      .send({ variantId: a.variantId, quantity: 2 })
      .expect(201);
    const cart = await request(app())
      .post(`${API}/customer/cart/items`)
      .set(as(customer))
      .send({ variantId: b.variantId, quantity: 1 })
      .expect(201);

    expect(cart.body.data.subtotal).toBe(102);
    expect(cart.body.data.readyForCheckout).toBe(true);

    const order = await request(app())
      .post(`${API}/customer/orders`)
      .set(as(customer))
      .send({ fromCart: true })
      .expect(201);
    expect(order.body.data.total).toBe(102);
    expect(await stockOf(a.variantId)).toBe(8);
    expect(await stockOf(b.variantId)).toBe(9);

    const emptied = await request(app()).get(`${API}/customer/cart`).set(as(customer)).expect(200);
    expect(emptied.body.data.items).toHaveLength(0);
  });

  it('rejects checkout from an empty cart', async () => {
    const customer = await createCustomer();
    const res = await request(app())
      .post(`${API}/customer/orders`)
      .set(as(customer))
      .send({ fromCart: true })
      .expect(422);
    expect(res.body.error.code).toBe('CART_EMPTY');
  });
});

describe('order status transitions', () => {
  it('walks an order through the allowed states', async () => {
    const admin = await createAdmin();
    const customer = await createCustomer();
    const fixture = await createCatalogue({ sku: 'FLOW-W-M', stock: 10 });

    const order = await request(app())
      .post(`${API}/customer/orders`)
      .set(as(customer))
      .send({ items: [{ variantId: fixture.variantId, quantity: 1 }] })
      .expect(201);
    const id = order.body.data.id;

    for (const status of ['CONFIRMED', 'PAID', 'COMPLETED']) {
      const res = await request(app())
        .post(`${API}/admin/orders/${id}/status`)
        .set(as(admin))
        .send({ status })
        .expect(200);
      expect(res.body.data.status).toBe(status);
    }

    // Stock was deducted once at creation and never again along the way.
    expect(await stockOf(fixture.variantId)).toBe(9);
    expect(
      await prisma.inventoryTransaction.count({ where: { referenceType: 'ORDER', referenceId: id } }),
    ).toBe(1);
  });

  it('rejects an invalid transition', async () => {
    const admin = await createAdmin();
    const customer = await createCustomer();
    const fixture = await createCatalogue({ sku: 'BADFLOW-W-M', stock: 10 });

    const order = await request(app())
      .post(`${API}/customer/orders`)
      .set(as(customer))
      .send({ items: [{ variantId: fixture.variantId, quantity: 1 }] })
      .expect(201);

    await request(app())
      .post(`${API}/admin/orders/${order.body.data.id}/status`)
      .set(as(admin))
      .send({ status: 'CANCELLED' })
      .expect(200);

    // CANCELLED is terminal.
    const res = await request(app())
      .post(`${API}/admin/orders/${order.body.data.id}/status`)
      .set(as(admin))
      .send({ status: 'PAID' })
      .expect(409);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    expect(res.body.error.details.allowed).toEqual([]);
  });

  it('rejects an unknown status value', async () => {
    const admin = await createAdmin();
    const customer = await createCustomer();
    const fixture = await createCatalogue({ sku: 'UNK-W-M', stock: 10 });
    const order = await request(app())
      .post(`${API}/customer/orders`)
      .set(as(customer))
      .send({ items: [{ variantId: fixture.variantId, quantity: 1 }] })
      .expect(201);

    const res = await request(app())
      .post(`${API}/admin/orders/${order.body.data.id}/status`)
      .set(as(admin))
      .send({ status: 'SHIPPED' })
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('marks a paid order as refunded when it is cancelled', async () => {
    const admin = await createAdmin();
    const customer = await createCustomer();
    const fixture = await createCatalogue({ sku: 'REF-W-M', stock: 10 });

    const order = await request(app())
      .post(`${API}/customer/orders`)
      .set(as(customer))
      .send({ items: [{ variantId: fixture.variantId, quantity: 1 }] })
      .expect(201);

    await request(app())
      .post(`${API}/admin/orders/${order.body.data.id}/status`)
      .set(as(admin))
      .send({ status: 'PAID', paymentMethod: 'CARD' })
      .expect(200);

    const cancelled = await request(app())
      .post(`${API}/admin/orders/${order.body.data.id}/cancel`)
      .set(as(admin))
      .send({ reason: 'Out of stock at the warehouse' })
      .expect(200);

    expect(cancelled.body.data.status).toBe('CANCELLED');
    expect(cancelled.body.data.paymentStatus).toBe('REFUNDED');
    expect(await stockOf(fixture.variantId)).toBe(10);
  });
});
