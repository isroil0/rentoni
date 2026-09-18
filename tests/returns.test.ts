import { describe, expect, it } from 'vitest';
import { API, app, as, createAdmin, createCatalogue, createCustomer, prisma, request, stockOf } from './helpers';

/** Sells `quantity` units through POS and marks the order COMPLETED (returnable). */
async function completedPosSale(
  admin: { token: string },
  variantId: number,
  quantity: number,
): Promise<{ id: number; orderNumber: string }> {
  const res = await request(app())
    .post(`${API}/admin/pos/orders`)
    .set({ Authorization: `Bearer ${admin.token}` })
    .send({ items: [{ variantId, quantity }], completeNow: true })
    .expect(201);
  return res.body.data;
}

describe('returns', () => {
  it('accepts a valid return, restores stock and records a RETURN transaction', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'RET-W-M', stock: 20, sellingPrice: 30 });
    const order = await completedPosSale(admin, fixture.variantId, 5);
    expect(await stockOf(fixture.variantId)).toBe(15);

    const res = await request(app())
      .post(`${API}/admin/returns`)
      .set(as(admin))
      .send({
        orderId: order.id,
        items: [{ variantId: fixture.variantId, quantity: 1 }],
        reason: 'Wrong size',
      })
      .expect(201);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('ACCEPTED');
    expect(res.body.data[0].quantity).toBe(1);
    expect(res.body.data[0].refundAmount).toBe(30);
    expect(res.body.data[0].returnNumber).toMatch(/^RET-\d{8}-\d{5}$/);

    expect(await stockOf(fixture.variantId)).toBe(16);
    const tx = await prisma.inventoryTransaction.findFirstOrThrow({
      where: { referenceType: 'RETURN', referenceId: res.body.data[0].id },
    });
    expect(tx).toMatchObject({ type: 'RETURN', quantity: 1, previousQuantity: 15, newQuantity: 16 });
  });

  it('refuses to return more than was purchased', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'RETMAX-W-M', stock: 20 });
    const order = await completedPosSale(admin, fixture.variantId, 2);

    const res = await request(app())
      .post(`${API}/admin/returns`)
      .set(as(admin))
      .send({ orderId: order.id, items: [{ variantId: fixture.variantId, quantity: 3 }] })
      .expect(422);

    expect(res.body.error.code).toBe('INVALID_RETURN_QUANTITY');
    expect(res.body.error.details).toMatchObject({ ordered: 2, eligible: 2, requested: 3 });
    expect(await stockOf(fixture.variantId)).toBe(18);
  });

  it('counts earlier returns towards the eligible quantity', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'RETCUM-W-M', stock: 20 });
    const order = await completedPosSale(admin, fixture.variantId, 3);

    await request(app())
      .post(`${API}/admin/returns`)
      .set(as(admin))
      .send({ orderId: order.id, items: [{ variantId: fixture.variantId, quantity: 2 }] })
      .expect(201);

    const second = await request(app())
      .post(`${API}/admin/returns`)
      .set(as(admin))
      .send({ orderId: order.id, items: [{ variantId: fixture.variantId, quantity: 2 }] })
      .expect(422);
    expect(second.body.error.details).toMatchObject({ alreadyReturned: 2, eligible: 1 });

    // The remaining single unit is accepted.
    await request(app())
      .post(`${API}/admin/returns`)
      .set(as(admin))
      .send({ orderId: order.id, items: [{ variantId: fixture.variantId, quantity: 1 }] })
      .expect(201);
    expect(await stockOf(fixture.variantId)).toBe(20);
  });

  it('rejects a return for a variant that was not in the order', async () => {
    const admin = await createAdmin();
    const sold = await createCatalogue({ sku: 'RETIN-W-M', stock: 10 });
    const other = await createCatalogue({ sku: 'RETOUT-W-M', stock: 10 });
    const order = await completedPosSale(admin, sold.variantId, 1);

    const res = await request(app())
      .post(`${API}/admin/returns`)
      .set(as(admin))
      .send({ orderId: order.id, items: [{ variantId: other.variantId, quantity: 1 }] })
      .expect(422);
    expect(res.body.error.code).toBe('ITEM_NOT_IN_ORDER');
    expect(await stockOf(other.variantId)).toBe(10);
  });

  it('rejects a zero or negative return quantity', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'RETZERO-W-M', stock: 10 });
    const order = await completedPosSale(admin, fixture.variantId, 2);

    for (const quantity of [0, -1]) {
      const res = await request(app())
        .post(`${API}/admin/returns`)
        .set(as(admin))
        .send({ orderId: order.id, items: [{ variantId: fixture.variantId, quantity }] })
        .expect(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await stockOf(fixture.variantId)).toBe(8);
  });

  it('refuses returns against an order that is not yet fulfilled', async () => {
    const admin = await createAdmin();
    const customer = await createCustomer();
    const fixture = await createCatalogue({ sku: 'RETPEND-W-M', stock: 10 });

    const order = await request(app())
      .post(`${API}/customer/orders`)
      .set(as(customer))
      .send({ items: [{ variantId: fixture.variantId, quantity: 1 }] })
      .expect(201);

    const res = await request(app())
      .post(`${API}/admin/returns`)
      .set(as(admin))
      .send({ orderId: order.body.data.id, items: [{ variantId: fixture.variantId, quantity: 1 }] })
      .expect(409);
    expect(res.body.error.code).toBe('ORDER_NOT_RETURNABLE');
  });

  it('reports what is still eligible for return', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'RETELIG-W-M', stock: 20 });
    const order = await completedPosSale(admin, fixture.variantId, 4);

    await request(app())
      .post(`${API}/admin/returns`)
      .set(as(admin))
      .send({ orderId: order.id, items: [{ variantId: fixture.variantId, quantity: 1 }] })
      .expect(201);

    const res = await request(app())
      .get(`${API}/admin/returns/eligibility/${order.id}`)
      .set(as(admin))
      .expect(200);
    expect(res.body.data.returnable).toBe(true);
    expect(res.body.data.lines[0]).toMatchObject({ ordered: 4, alreadyReturned: 1, eligible: 3 });
  });

  describe('customer-raised returns', () => {
    it('creates a REQUESTED return that does not move stock until an admin accepts it', async () => {
      const admin = await createAdmin();
      const customer = await createCustomer();
      const fixture = await createCatalogue({ sku: 'CRET-W-M', stock: 10 });

      const order = await request(app())
        .post(`${API}/customer/orders`)
        .set(as(customer))
        .send({ items: [{ variantId: fixture.variantId, quantity: 2 }] })
        .expect(201);

      await request(app())
        .post(`${API}/admin/orders/${order.body.data.id}/status`)
        .set(as(admin))
        .send({ status: 'COMPLETED' })
        .expect(200);
      expect(await stockOf(fixture.variantId)).toBe(8);

      const requested = await request(app())
        .post(`${API}/customer/returns`)
        .set(as(customer))
        .send({
          orderId: order.body.data.id,
          items: [{ variantId: fixture.variantId, quantity: 1 }],
          reason: 'Too tight',
        })
        .expect(201);

      expect(requested.body.data[0].status).toBe('REQUESTED');
      // Nothing has physically come back yet.
      expect(await stockOf(fixture.variantId)).toBe(8);

      const accepted = await request(app())
        .post(`${API}/admin/returns/${requested.body.data[0].id}/accept`)
        .set(as(admin))
        .send({})
        .expect(200);
      expect(accepted.body.data.status).toBe('ACCEPTED');
      expect(await stockOf(fixture.variantId)).toBe(9);

      // Accepting twice must not inflate stock.
      const again = await request(app())
        .post(`${API}/admin/returns/${requested.body.data[0].id}/accept`)
        .set(as(admin))
        .send({})
        .expect(409);
      expect(again.body.error.code).toBe('RETURN_ALREADY_PROCESSED');
      expect(await stockOf(fixture.variantId)).toBe(9);
    });

    it('rejects a return request without restocking', async () => {
      const admin = await createAdmin();
      const customer = await createCustomer();
      const fixture = await createCatalogue({ sku: 'CRETREJ-W-M', stock: 10 });

      const order = await request(app())
        .post(`${API}/customer/orders`)
        .set(as(customer))
        .send({ items: [{ variantId: fixture.variantId, quantity: 1 }] })
        .expect(201);
      await request(app())
        .post(`${API}/admin/orders/${order.body.data.id}/status`)
        .set(as(admin))
        .send({ status: 'COMPLETED' })
        .expect(200);

      const requested = await request(app())
        .post(`${API}/customer/returns`)
        .set(as(customer))
        .send({ orderId: order.body.data.id, items: [{ variantId: fixture.variantId, quantity: 1 }] })
        .expect(201);

      await request(app())
        .post(`${API}/admin/returns/${requested.body.data[0].id}/reject`)
        .set(as(admin))
        .send({ reason: 'Item shows signs of wear' })
        .expect(200);

      expect(await stockOf(fixture.variantId)).toBe(9);

      // After rejection the quantity becomes eligible again.
      const eligibility = await request(app())
        .get(`${API}/admin/returns/eligibility/${order.body.data.id}`)
        .set(as(admin))
        .expect(200);
      expect(eligibility.body.data.lines[0].eligible).toBe(1);
    });

    it('lets a customer see only their own returns', async () => {
      const admin = await createAdmin();
      const alice = await createCustomer();
      const bob = await createCustomer();
      const fixture = await createCatalogue({ sku: 'CRETOWN-W-M', stock: 10 });

      const order = await request(app())
        .post(`${API}/customer/orders`)
        .set(as(alice))
        .send({ items: [{ variantId: fixture.variantId, quantity: 1 }] })
        .expect(201);
      await request(app())
        .post(`${API}/admin/orders/${order.body.data.id}/status`)
        .set(as(admin))
        .send({ status: 'COMPLETED' })
        .expect(200);

      const created = await request(app())
        .post(`${API}/customer/returns`)
        .set(as(alice))
        .send({ orderId: order.body.data.id, items: [{ variantId: fixture.variantId, quantity: 1 }] })
        .expect(201);

      const mine = await request(app()).get(`${API}/customer/returns`).set(as(alice)).expect(200);
      expect(mine.body.data).toHaveLength(1);

      const theirs = await request(app()).get(`${API}/customer/returns`).set(as(bob)).expect(200);
      expect(theirs.body.data).toHaveLength(0);

      await request(app())
        .get(`${API}/customer/returns/${created.body.data[0].id}`)
        .set(as(bob))
        .expect(404);
    });

    it('refuses a customer return after the return window closes', async () => {
      const admin = await createAdmin();
      const customer = await createCustomer();
      const fixture = await createCatalogue({ sku: 'CRETWIN-W-M', stock: 10 });

      const order = await request(app())
        .post(`${API}/customer/orders`)
        .set(as(customer))
        .send({ items: [{ variantId: fixture.variantId, quantity: 1 }] })
        .expect(201);
      await request(app())
        .post(`${API}/admin/orders/${order.body.data.id}/status`)
        .set(as(admin))
        .send({ status: 'COMPLETED' })
        .expect(200);

      await prisma.order.update({
        where: { id: order.body.data.id },
        data: { createdAt: new Date(Date.now() - 30 * 864e5) },
      });

      const res = await request(app())
        .post(`${API}/customer/returns`)
        .set(as(customer))
        .send({ orderId: order.body.data.id, items: [{ variantId: fixture.variantId, quantity: 1 }] })
        .expect(409);
      expect(res.body.error.code).toBe('RETURN_WINDOW_EXPIRED');
    });
  });

  it('blocks cancelling an order that already has returns against it', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'RETCAN-W-M', stock: 10 });
    const order = await completedPosSale(admin, fixture.variantId, 3);

    await request(app())
      .post(`${API}/admin/returns`)
      .set(as(admin))
      .send({ orderId: order.id, items: [{ variantId: fixture.variantId, quantity: 1 }] })
      .expect(201);
    expect(await stockOf(fixture.variantId)).toBe(8);

    const res = await request(app())
      .post(`${API}/admin/orders/${order.id}/cancel`)
      .set(as(admin))
      .send({})
      .expect(409);
    expect(res.body.error.code).toBe('ORDER_NOT_CANCELLABLE');
    // Stock is unchanged: no double credit for the same physical units.
    expect(await stockOf(fixture.variantId)).toBe(8);
  });
});
