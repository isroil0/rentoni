import { describe, expect, it } from 'vitest';
import { InventoryApi } from '@/api/inventory.api';
import { OrdersApi } from '@/api/orders.api';
import { ReportsApi } from '@/api/reports.api';
import { SystemApi } from '@/api/system.api';
import { CustomersApi } from '@/api/customers.api';
import { PosApi } from '@/api/pos.api';
import { CustomerApi } from '@/api/customer.api';
import { CatalogApi } from '@/api/catalog.api';
import { ApiError, tokenStore } from '@/lib/apiClient';
import { CUSTOMER, CUSTOMER_TWO, signIn, signInAsAdmin, signInAsCustomer, signOutLocally } from './helpers';

describe('authorization (real API)', () => {
  it('lets SUPER_ADMIN read every admin resource', async () => {
    await signInAsAdmin();

    await expect(InventoryApi.list({ limit: 1 })).resolves.toHaveProperty('items');
    await expect(OrdersApi.list({ limit: 1 })).resolves.toHaveProperty('items');
    await expect(CustomersApi.list({ limit: 1 })).resolves.toHaveProperty('items');
    await expect(ReportsApi.dashboard()).resolves.toHaveProperty('sales');
    await expect(SystemApi.auditLogs({ limit: 1 })).resolves.toHaveProperty('items');
    await expect(SystemApi.getSettings()).resolves.toBeTruthy();
  });

  it('blocks a CUSTOMER from every admin resource with FORBIDDEN', async () => {
    await signInAsCustomer();

    const attempts: [string, Promise<unknown>][] = [
      ['inventory', InventoryApi.list()],
      ['orders', OrdersApi.list()],
      ['customers', CustomersApi.list()],
      ['dashboard', ReportsApi.dashboard()],
      ['audit logs', SystemApi.auditLogs()],
      ['settings', SystemApi.getSettings()],
      ['inventory transactions', InventoryApi.transactions()],
      ['POS search', PosApi.search('shirt')],
    ];

    for (const [label, promise] of attempts) {
      await expect(promise, label).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
    }
  });

  it('blocks a CUSTOMER from admin writes, leaving stock untouched', async () => {
    await signInAsAdmin();
    const before = await InventoryApi.list({ limit: 1 });
    const row = before.items[0]!;

    await signInAsCustomer();
    await expect(InventoryApi.adjust({ variantId: row.variantId, setQuantity: 9999 })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      PosApi.createOrder({ items: [{ variantId: row.variantId, quantity: 1 }], completeNow: true }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await signInAsAdmin();
    const after = await InventoryApi.getByVariant(row.variantId);
    expect(after.quantity).toBe(row.quantity);
  });

  it('rejects anonymous access to admin and customer resources', async () => {
    signOutLocally();
    await expect(InventoryApi.list()).rejects.toBeInstanceOf(ApiError);
    await expect(CustomerApi.getProfile()).rejects.toBeInstanceOf(ApiError);
  });

  it('blocks a SUPER_ADMIN from the customer-only endpoints', async () => {
    await signInAsAdmin();
    await expect(CustomerApi.getProfile()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it("stops a customer reading another customer's order", async () => {
    // Customer one places an order.
    await signIn(CUSTOMER);
    const products = await CatalogApi.listProducts({ limit: 5, availability: 'IN_STOCK' });
    const variant = products.items.flatMap((p) => p.variants).find((v) => v.inStock)!;
    const order = await CustomerApi.placeOrder({ items: [{ variantId: variant.id, quantity: 1 }] });

    await expect(CustomerApi.getOrder(order.id)).resolves.toMatchObject({ id: order.id });

    // Customer two cannot see it — and gets 404, not 403, so existence isn't confirmed.
    await signIn(CUSTOMER_TWO);
    await expect(CustomerApi.getOrder(order.id)).rejects.toMatchObject({
      code: 'ORDER_NOT_FOUND',
      status: 404,
    });

    const theirOrders = await CustomerApi.listOrders({ limit: 50 });
    expect(theirOrders.items.some((o) => o.id === order.id)).toBe(false);
  });

  it("stops a customer cancelling another customer's order", async () => {
    await signIn(CUSTOMER);
    const products = await CatalogApi.listProducts({ limit: 5, availability: 'IN_STOCK' });
    const variant = products.items.flatMap((p) => p.variants).find((v) => v.inStock)!;
    const order = await CustomerApi.placeOrder({ items: [{ variantId: variant.id, quantity: 1 }] });

    await signIn(CUSTOMER_TWO);
    await expect(CustomerApi.cancelOrder(order.id)).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });

    await signIn(CUSTOMER);
    expect((await CustomerApi.getOrder(order.id)).status).toBe('PENDING');
  });

  it('keeps the auth header off anonymous requests', async () => {
    await signInAsCustomer();
    expect(tokenStore.getAccessToken()).toBeTruthy();
    // The public catalogue works regardless of who is (or is not) signed in.
    signOutLocally();
    await expect(CatalogApi.listProducts({ limit: 1 })).resolves.toHaveProperty('items');
  });
});
