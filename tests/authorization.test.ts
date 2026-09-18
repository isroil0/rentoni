import { describe, expect, it } from 'vitest';
import {
  API,
  app,
  as,
  createAdmin,
  createCatalogue,
  createCustomer,
  prisma,
  request,
} from './helpers';

const ADMIN_ROUTES = [
  '/admin/products',
  '/admin/variants',
  '/admin/inventory',
  '/admin/inventory/low-stock',
  '/admin/inventory/transactions',
  '/admin/orders',
  '/admin/purchases',
  '/admin/suppliers',
  '/admin/returns',
  '/admin/customers',
  '/admin/dashboard/summary',
  '/admin/reports/sales',
  '/admin/reports/inventory',
  '/admin/audit-logs',
  '/admin/settings',
];

describe('authorization', () => {
  it('lets SUPER_ADMIN reach every admin endpoint', async () => {
    const admin = await createAdmin();
    for (const route of ADMIN_ROUTES) {
      const res = await request(app()).get(`${API}${route}`).set(as(admin));
      expect(res.status, `${route} returned ${res.status}`).toBe(200);
    }
  });

  it('blocks CUSTOMER from every admin endpoint with FORBIDDEN', async () => {
    const customer = await createCustomer();
    for (const route of ADMIN_ROUTES) {
      const res = await request(app()).get(`${API}${route}`).set(as(customer));
      expect(res.status, `${route} returned ${res.status}`).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('blocks anonymous access to admin endpoints', async () => {
    for (const route of ADMIN_ROUTES.slice(0, 5)) {
      const res = await request(app()).get(`${API}${route}`).expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('blocks CUSTOMER from admin write operations', async () => {
    const customer = await createCustomer();
    const fixture = await createCatalogue({ stock: 10 });

    const writes: [string, string, object][] = [
      ['post', '/admin/products', { categoryId: fixture.categoryId, name: 'Hacked Shirt' }],
      ['put', `/admin/variants/${fixture.variantId}`, { sellingPrice: 1 }],
      ['post', '/admin/inventory/adjust', { variantId: fixture.variantId, setQuantity: 9999 }],
      ['post', '/admin/pos/orders', { items: [{ variantId: fixture.variantId, quantity: 1 }] }],
      ['post', '/admin/suppliers', { name: 'Ghost Supplier' }],
    ];

    for (const [method, route, body] of writes) {
      const res = await (request(app()) as never as Record<string, Function>)[method]!(`${API}${route}`)
        .set(as(customer))
        .send(body);
      expect(res.status, `${method} ${route}`).toBe(403);
    }

    // Nothing was mutated.
    const inventory = await prisma.inventory.findUniqueOrThrow({ where: { variantId: fixture.variantId } });
    expect(inventory.quantity).toBe(10);
    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: fixture.variantId } });
    expect(variant.sellingPriceCents).toBe(3000);
  });

  it('blocks SUPER_ADMIN from the customer-only self-service routes', async () => {
    const admin = await createAdmin();
    const res = await request(app()).get(`${API}/customer/profile`).set(as(admin)).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  describe('customer data isolation', () => {
    it("prevents a customer from reading another customer's order", async () => {
      const alice = await createCustomer({ name: 'Alice' });
      const bob = await createCustomer({ name: 'Bob' });
      const fixture = await createCatalogue({ sku: 'ISO-W-M', stock: 10 });

      const created = await request(app())
        .post(`${API}/customer/orders`)
        .set(as(alice))
        .send({ items: [{ variantId: fixture.variantId, quantity: 1 }] })
        .expect(201);
      const orderId = created.body.data.id;

      // Alice sees her own order.
      await request(app()).get(`${API}/customer/orders/${orderId}`).set(as(alice)).expect(200);

      // Bob gets a 404 — the API does not even confirm the order exists.
      const denied = await request(app())
        .get(`${API}/customer/orders/${orderId}`)
        .set(as(bob))
        .expect(404);
      expect(denied.body.error.code).toBe('ORDER_NOT_FOUND');

      // Bob's own order list is empty.
      const bobList = await request(app()).get(`${API}/customer/orders`).set(as(bob)).expect(200);
      expect(bobList.body.data).toHaveLength(0);
    });

    it("prevents a customer from cancelling another customer's order", async () => {
      const alice = await createCustomer();
      const bob = await createCustomer();
      const fixture = await createCatalogue({ sku: 'ISO2-W-M', stock: 10 });

      const created = await request(app())
        .post(`${API}/customer/orders`)
        .set(as(alice))
        .send({ items: [{ variantId: fixture.variantId, quantity: 2 }] })
        .expect(201);

      const res = await request(app())
        .post(`${API}/customer/orders/${created.body.data.id}/cancel`)
        .set(as(bob))
        .send({})
        .expect(404);
      expect(res.body.error.code).toBe('ORDER_NOT_FOUND');

      // Alice's order is untouched and stock is still committed.
      const order = await prisma.order.findUniqueOrThrow({ where: { id: created.body.data.id } });
      expect(order.status).toBe('PENDING');
      const inv = await prisma.inventory.findUniqueOrThrow({ where: { variantId: fixture.variantId } });
      expect(inv.quantity).toBe(8);
    });

    it("prevents a customer from returning against another customer's order", async () => {
      const alice = await createCustomer();
      const bob = await createCustomer();
      const admin = await createAdmin();
      const fixture = await createCatalogue({ sku: 'ISO3-W-M', stock: 10 });

      const created = await request(app())
        .post(`${API}/customer/orders`)
        .set(as(alice))
        .send({ items: [{ variantId: fixture.variantId, quantity: 2 }] })
        .expect(201);

      await request(app())
        .post(`${API}/admin/orders/${created.body.data.id}/status`)
        .set(as(admin))
        .send({ status: 'COMPLETED' })
        .expect(200);

      const res = await request(app())
        .post(`${API}/customer/returns`)
        .set(as(bob))
        .send({ orderId: created.body.data.id, items: [{ variantId: fixture.variantId, quantity: 1 }] })
        .expect(404);
      expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
    });
  });

  describe('cost price protection', () => {
    it('never exposes cost price, supplier or inventory internals on public product APIs', async () => {
      await createCatalogue({ sku: 'PUB-W-M', stock: 10, costPrice: 18, sellingPrice: 30 });

      const list = await request(app()).get(`${API}/products`).expect(200);
      const detail = await request(app()).get(`${API}/products/${list.body.data[0].id}`).expect(200);

      for (const payload of [list.body, detail.body]) {
        const raw = JSON.stringify(payload);
        expect(raw).not.toContain('costPrice');
        expect(raw).not.toContain('cost_price');
        expect(raw).not.toContain('marginPerUnit');
        expect(raw).not.toContain('supplier');
        expect(raw).not.toContain('minimumStock');
        // 18.00 is the cost price and must not appear anywhere.
        expect(raw).not.toMatch(/"price":\s*18\b/);
      }
      expect(detail.body.data.variants[0].price).toBe(30);
      expect(detail.body.data.variants[0].availability).toBe('IN_STOCK');
    });

    it('hides exact stock counts from customers unless explicitly enabled', async () => {
      const admin = await createAdmin();
      const fixture = await createCatalogue({ sku: 'STK-W-M', stock: 7 });

      const hidden = await request(app()).get(`${API}/products/${fixture.productId}`).expect(200);
      expect(hidden.body.data.variants[0]).not.toHaveProperty('quantity');

      await request(app())
        .put(`${API}/admin/settings`)
        .set(as(admin))
        .send({ settings: { 'customer.expose_exact_stock': 'true' } })
        .expect(200);

      const shown = await request(app()).get(`${API}/products/${fixture.productId}`).expect(200);
      expect(shown.body.data.variants[0].quantity).toBe(7);
    });

    it('exposes cost price and margin to SUPER_ADMIN', async () => {
      const admin = await createAdmin();
      const fixture = await createCatalogue({ sku: 'ADM-W-M', stock: 5, costPrice: 18, sellingPrice: 30 });
      const res = await request(app())
        .get(`${API}/admin/variants/${fixture.variantId}`)
        .set(as(admin))
        .expect(200);
      expect(res.body.data.costPrice).toBe(18);
      expect(res.body.data.sellingPrice).toBe(30);
      expect(res.body.data.marginPerUnit).toBe(12);
    });
  });
});
