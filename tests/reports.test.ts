import { beforeAll, describe, expect, it } from 'vitest';
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
} from './helpers';

describe('reports, audit and admin operations', () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let customer: Awaited<ReturnType<typeof createCustomer>>;
  let variantId: number;

  beforeAll(async () => {
    admin = await createAdmin();
    customer = await createCustomer();

    // cost 18, sells for 30 -> 12 profit per unit
    const fixture = await createCatalogue({ sku: 'RPT-W-M', stock: 100, costPrice: 18, sellingPrice: 30 });
    variantId = fixture.variantId;

    await request(app())
      .post(`${API}/admin/pos/orders`)
      .set(as(admin))
      .send({ items: [{ variantId, quantity: 4 }], paymentMethod: 'CASH', completeNow: true })
      .expect(201);

    await request(app())
      .post(`${API}/customer/orders`)
      .set(as(customer))
      .send({ items: [{ variantId, quantity: 2 }] })
      .expect(201);
  });

  it('summarises the dashboard for today', async () => {
    const res = await request(app())
      .get(`${API}/admin/dashboard/summary?preset=today`)
      .set(as(admin))
      .expect(200);

    const d = res.body.data;
    expect(d.sales.orders).toBe(2);
    expect(d.sales.itemsSold).toBe(6);
    expect(d.sales.revenue).toBe(180); // 6 x 30
    expect(d.sales.costOfGoods).toBe(108); // 6 x 18
    expect(d.sales.profit).toBe(72);
    expect(d.sales.averageOrderValue).toBe(90);
    expect(d.inventory.totalUnits).toBe(94);
    expect(d.customers.total).toBeGreaterThanOrEqual(1);
  });

  it('breaks sales down by day, source and payment method', async () => {
    const res = await request(app()).get(`${API}/admin/reports/sales?preset=today`).set(as(admin)).expect(200);

    expect(res.body.data.totals).toMatchObject({
      orders: 2,
      revenue: 180,
      unitsSold: 6,
      costOfGoods: 108,
      profit: 72,
    });
    const sources = Object.fromEntries(
      res.body.data.bySource.map((s: { source: string; units: number }) => [s.source, s.units]),
    );
    expect(sources).toEqual({ POS: 4, ONLINE: 2 });
    expect(res.body.data.byDay).toHaveLength(1);
  });

  it('values current inventory at cost and at retail', async () => {
    const res = await request(app()).get(`${API}/admin/reports/inventory`).set(as(admin)).expect(200);

    expect(res.body.data.totals.totalUnits).toBe(94);
    expect(res.body.data.totals.stockValueAtCost).toBe(94 * 18);
    expect(res.body.data.totals.stockValueAtRetail).toBe(94 * 30);
    expect(res.body.data.totals.potentialProfit).toBe(94 * 12);
    expect(res.body.data.byStatus.IN_STOCK).toBe(1);
  });

  it('ranks products by units sold with per-variant profit', async () => {
    const res = await request(app())
      .get(`${API}/admin/reports/products?preset=today`)
      .set(as(admin))
      .expect(200);

    expect(res.body.data.topSellers[0]).toMatchObject({
      sku: 'RPT-W-M',
      unitsSold: 6,
      revenue: 180,
      cost: 108,
      profit: 72,
    });
  });

  it('reports profit per day with a margin percentage', async () => {
    const res = await request(app()).get(`${API}/admin/reports/profit?preset=today`).set(as(admin)).expect(200);
    expect(res.body.data.totals).toMatchObject({ revenue: 180, costOfGoods: 108, profit: 72, marginPercent: 40 });
    expect(res.body.data.byDay[0].profit).toBe(72);
  });

  it('supports custom date ranges and excludes out-of-range activity', async () => {
    const res = await request(app())
      .get(`${API}/admin/reports/sales?from=2020-01-01&to=2020-01-31`)
      .set(as(admin))
      .expect(200);
    expect(res.body.data.totals.orders).toBe(0);
    expect(res.body.data.totals.revenue).toBe(0);
  });

  it('excludes cancelled orders from revenue', async () => {
    const fixture = await createCatalogue({ sku: 'RPTCAN-W-M', stock: 10, costPrice: 10, sellingPrice: 20 });
    const order = await request(app())
      .post(`${API}/admin/pos/orders`)
      .set(as(admin))
      .send({ items: [{ variantId: fixture.variantId, quantity: 2 }], completeNow: true })
      .expect(201);

    const before = await request(app())
      .get(`${API}/admin/reports/sales?preset=today`)
      .set(as(admin))
      .expect(200);
    expect(before.body.data.totals.revenue).toBe(220);

    await request(app())
      .post(`${API}/admin/orders/${order.body.data.id}/cancel`)
      .set(as(admin))
      .send({})
      .expect(200);

    const after = await request(app())
      .get(`${API}/admin/reports/sales?preset=today`)
      .set(as(admin))
      .expect(200);
    expect(after.body.data.totals.revenue).toBe(180);
  });

  it('reports purchases and returns', async () => {
    const supplier = await createSupplier('Report Supplier');
    await request(app())
      .post(`${API}/admin/purchases`)
      .set(as(admin))
      .send({
        supplierId: supplier.id,
        items: [{ variantId, quantity: 10, unitCost: 18 }],
        receiveNow: true,
      })
      .expect(201);

    const purchases = await request(app())
      .get(`${API}/admin/reports/purchases?preset=today`)
      .set(as(admin))
      .expect(200);
    expect(purchases.body.data.totals.unitsReceived).toBe(10);
    expect(purchases.body.data.totals.costReceived).toBe(180);

    const returns = await request(app())
      .get(`${API}/admin/reports/returns?preset=today`)
      .set(as(admin))
      .expect(200);
    expect(returns.body.data.totals).toHaveProperty('returns');
  });

  describe('audit log', () => {
    it('records admin actions with before and after values', async () => {
      await request(app())
        .post(`${API}/admin/inventory/adjust`)
        .set(as(admin))
        .send({ variantId, type: 'DAMAGE', quantity: 2, note: 'Torn packaging' })
        .expect(200);

      const res = await request(app())
        .get(`${API}/admin/audit-logs?action=INVENTORY_ADJUSTED`)
        .set(as(admin))
        .expect(200);

      expect(res.body.data.length).toBeGreaterThan(0);
      const entry = res.body.data[0];
      expect(entry.entityType).toBe('ProductVariant');
      expect(entry.user.email).toBe(admin.email);
      expect(JSON.parse(entry.newValue).note).toBe('Torn packaging');
    });

    it('filters by entity and never stores secrets', async () => {
      const res = await request(app())
        .get(`${API}/admin/audit-logs?entityType=ProductVariant&entityId=${variantId}`)
        .set(as(admin))
        .expect(200);
      expect(res.body.data.every((e: { entityType: string }) => e.entityType === 'ProductVariant')).toBe(true);

      const all = JSON.stringify(await prisma.auditLog.findMany());
      expect(all).not.toContain('passwordHash');
      expect(all).not.toContain('refreshToken');
    });
  });

  describe('customers and suppliers', () => {
    it('lists customers with order counts and lifetime spend', async () => {
      const res = await request(app()).get(`${API}/admin/customers`).set(as(admin)).expect(200);
      const row = res.body.data.find((c: { id: number }) => c.id === customer.id);
      expect(row).toMatchObject({ orderCount: 1, totalSpent: 60 });
      expect(row).not.toHaveProperty('passwordHash');
    });

    it('deactivates a customer and immediately invalidates their session', async () => {
      const target = await createCustomer();
      await request(app()).get(`${API}/customer/profile`).set(as(target)).expect(200);

      await request(app())
        .patch(`${API}/admin/customers/${target.id}/status`)
        .set(as(admin))
        .send({ active: false })
        .expect(200);

      const res = await request(app()).get(`${API}/customer/profile`).set(as(target)).expect(401);
      expect(res.body.error.code).toBe('SESSION_EXPIRED');
    });

    it('manages suppliers and refuses to hard-delete one with purchases', async () => {
      const created = await request(app())
        .post(`${API}/admin/suppliers`)
        .set(as(admin))
        .send({ name: 'Northline Garments', phone: '+15550300002' })
        .expect(201);

      await request(app())
        .put(`${API}/admin/suppliers/${created.body.data.id}`)
        .set(as(admin))
        .send({ address: '88 Harbour Way' })
        .expect(200);

      await request(app())
        .post(`${API}/admin/purchases`)
        .set(as(admin))
        .send({ supplierId: created.body.data.id, items: [{ variantId, quantity: 1, unitCost: 18 }] })
        .expect(201);

      const hard = await request(app())
        .delete(`${API}/admin/suppliers/${created.body.data.id}?hard=true`)
        .set(as(admin))
        .expect(409);
      expect(hard.body.error.code).toBe('SUPPLIER_HAS_PURCHASES');

      const soft = await request(app())
        .delete(`${API}/admin/suppliers/${created.body.data.id}`)
        .set(as(admin))
        .expect(200);
      expect(soft.body.data.deactivated).toBe(true);
    });

    it('lets a customer update only their own profile fields', async () => {
      const res = await request(app())
        .put(`${API}/customer/profile`)
        .set(as(customer))
        .send({ name: 'Updated Name', phone: '+15551234567' })
        .expect(200);
      expect(res.body.data.name).toBe('Updated Name');
      expect(res.body.data.role).toBe('CUSTOMER');

      // Attempting to escalate is rejected by the strict schema.
      const escalation = await request(app())
        .put(`${API}/customer/profile`)
        .set(as(customer))
        .send({ role: 'SUPER_ADMIN' })
        .expect(422);
      expect(escalation.body.error.code).toBe('VALIDATION_ERROR');

      const fresh = await prisma.user.findUniqueOrThrow({ where: { id: customer.id } });
      expect(fresh.role).toBe('CUSTOMER');
    });
  });

  it('exposes a health endpoint that proves the database is reachable', async () => {
    const res = await request(app()).get(`${API}/health`).expect(200);
    expect(res.body.data.status).toBe('ok');
  });

  it('returns a consistent error envelope for unknown routes', async () => {
    const res = await request(app()).get(`${API}/does-not-exist`).expect(404);
    expect(res.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });
});
