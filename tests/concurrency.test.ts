import { describe, expect, it } from 'vitest';
import {
  API,
  app,
  as,
  createAdmin,
  createCatalogue,
  createCustomer,
  createSupplier,
  prisma,
  request,
  stockOf,
} from './helpers';

/**
 * Overselling protection.
 *
 * Stock changes go through one atomic guarded UPDATE
 * (`... WHERE variant_id = ? AND quantity + delta >= 0`) inside a database
 * transaction, so concurrent buyers of the last unit cannot both succeed.
 */
describe('concurrency', () => {
  it('lets exactly one of two simultaneous buyers take the last unit', async () => {
    const alice = await createCustomer();
    const bob = await createCustomer();
    const fixture = await createCatalogue({ sku: 'RACE-W-M', stock: 1 });

    const buy = (token: string) =>
      request(app())
        .post(`${API}/customer/orders`)
        .set({ Authorization: `Bearer ${token}` })
        .send({ items: [{ variantId: fixture.variantId, quantity: 1 }] });

    const [a, b] = await Promise.all([buy(alice.token), buy(bob.token)]);
    const statuses = [a.status, b.status].sort();

    expect(statuses).toEqual([201, 409]);
    const failure = [a, b].find((r) => r.status === 409)!;
    expect(failure.body.error.code).toBe('INSUFFICIENT_STOCK');

    // Final stock is 0 — never -1.
    expect(await stockOf(fixture.variantId)).toBe(0);
    expect(await prisma.order.count({ where: { items: { some: { variantId: fixture.variantId } } } })).toBe(1);
    expect(
      await prisma.inventoryTransaction.count({ where: { variantId: fixture.variantId, type: 'SALE' } }),
    ).toBe(1);
  });

  it('never oversells under a burst of 20 concurrent buyers for 5 units', async () => {
    const customer = await createCustomer();
    const fixture = await createCatalogue({ sku: 'BURST-W-M', stock: 5 });

    const attempts = Array.from({ length: 20 }, () =>
      request(app())
        .post(`${API}/customer/orders`)
        .set(as(customer))
        .send({ items: [{ variantId: fixture.variantId, quantity: 1 }] }),
    );
    const results = await Promise.all(attempts);

    const succeeded = results.filter((r) => r.status === 201);
    const failed = results.filter((r) => r.status === 409);

    expect(succeeded).toHaveLength(5);
    expect(failed).toHaveLength(15);
    expect(failed.every((r) => r.body.error.code === 'INSUFFICIENT_STOCK')).toBe(true);
    expect(await stockOf(fixture.variantId)).toBe(0);

    // The ledger balances: 5 sale transactions, each of exactly one unit.
    const txns = await prisma.inventoryTransaction.findMany({ where: { variantId: fixture.variantId, type: 'SALE' } });
    expect(txns).toHaveLength(5);
    expect(txns.reduce((sum, t) => sum + t.quantity, 0)).toBe(-5);
    expect(Math.min(...txns.map((t) => t.newQuantity))).toBe(0);
  });

  it('serialises concurrent POS sales of the last unit', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'POSRACE-W-M', stock: 1 });

    const sell = () =>
      request(app())
        .post(`${API}/admin/pos/orders`)
        .set(as(admin))
        .send({ items: [{ variantId: fixture.variantId, quantity: 1 }], completeNow: true });

    const results = await Promise.all([sell(), sell(), sell()]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    expect(await stockOf(fixture.variantId)).toBe(0);
  });

  it('handles a POS sale and an online order racing for the same unit', async () => {
    const admin = await createAdmin();
    const customer = await createCustomer();
    const fixture = await createCatalogue({ sku: 'MIXRACE-W-M', stock: 1 });

    const [pos, online] = await Promise.all([
      request(app())
        .post(`${API}/admin/pos/orders`)
        .set(as(admin))
        .send({ items: [{ variantId: fixture.variantId, quantity: 1 }], completeNow: true }),
      request(app())
        .post(`${API}/customer/orders`)
        .set(as(customer))
        .send({ items: [{ variantId: fixture.variantId, quantity: 1 }] }),
    ]);

    expect([pos.status, online.status].sort()).toEqual([201, 409]);
    expect(await stockOf(fixture.variantId)).toBe(0);
  });

  it('completes the same pending POS ticket only once under concurrency', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'DBLCOMP-W-M', stock: 10 });

    const ticket = await request(app())
      .post(`${API}/admin/pos/orders`)
      .set(as(admin))
      .send({ items: [{ variantId: fixture.variantId, quantity: 3 }] })
      .expect(201);

    const results = await Promise.all([
      request(app()).post(`${API}/admin/pos/orders/${ticket.body.data.id}/complete`).set(as(admin)).send({}),
      request(app()).post(`${API}/admin/pos/orders/${ticket.body.data.id}/complete`).set(as(admin)).send({}),
    ]);

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(1);
    // Deducted once, not twice.
    expect(await stockOf(fixture.variantId)).toBe(7);
  });

  it('receives the same purchase only once under concurrency', async () => {
    const admin = await createAdmin();
    const supplier = await createSupplier();
    const fixture = await createCatalogue({ sku: 'DBLRCV-W-M', stock: 0 });

    const purchase = await request(app())
      .post(`${API}/admin/purchases`)
      .set(as(admin))
      .send({ supplierId: supplier.id, items: [{ variantId: fixture.variantId, quantity: 10, unitCost: 18 }] })
      .expect(201);

    const results = await Promise.all([
      request(app()).post(`${API}/admin/purchases/${purchase.body.data.id}/receive`).set(as(admin)),
      request(app()).post(`${API}/admin/purchases/${purchase.body.data.id}/receive`).set(as(admin)),
    ]);

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await stockOf(fixture.variantId)).toBe(10);
  });

  it('issues unique order numbers under concurrent creation', async () => {
    const customer = await createCustomer();
    const fixture = await createCatalogue({ sku: 'NUMRACE-W-M', stock: 50 });

    const results = await Promise.all(
      Array.from({ length: 15 }, () =>
        request(app())
          .post(`${API}/customer/orders`)
          .set(as(customer))
          .send({ items: [{ variantId: fixture.variantId, quantity: 1 }] })
          .expect(201),
      ),
    );

    const numbers = results.map((r) => r.body.data.orderNumber);
    expect(new Set(numbers).size).toBe(15);
    expect(await stockOf(fixture.variantId)).toBe(35);
  });

  it('keeps the inventory ledger consistent with the final quantity', async () => {
    const admin = await createAdmin();
    const customer = await createCustomer();
    const fixture = await createCatalogue({ sku: 'LEDGER-W-M', stock: 30 });

    await Promise.all([
      ...Array.from({ length: 8 }, () =>
        request(app())
          .post(`${API}/customer/orders`)
          .set(as(customer))
          .send({ items: [{ variantId: fixture.variantId, quantity: 2 }] }),
      ),
      ...Array.from({ length: 4 }, () =>
        request(app())
          .post(`${API}/admin/pos/orders`)
          .set(as(admin))
          .send({ items: [{ variantId: fixture.variantId, quantity: 3 }], completeNow: true }),
      ),
    ]);

    const txns = await prisma.inventoryTransaction.findMany({
      where: { variantId: fixture.variantId },
      orderBy: { id: 'asc' },
    });

    // Sum of every signed movement must equal current stock, and each row's
    // before/after pair must chain with the previous one.
    const sum = txns.reduce((total, t) => total + t.quantity, 0);
    expect(sum).toBe(await stockOf(fixture.variantId));

    for (let i = 0; i < txns.length; i += 1) {
      const t = txns[i]!;
      expect(t.newQuantity).toBe(t.previousQuantity + t.quantity);
      expect(t.newQuantity).toBeGreaterThanOrEqual(0);
      if (i > 0) expect(t.previousQuantity).toBe(txns[i - 1]!.newQuantity);
    }
  });
});
