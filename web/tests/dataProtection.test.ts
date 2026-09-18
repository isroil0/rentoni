import { describe, expect, it } from 'vitest';
import { CatalogApi } from '@/api/catalog.api';
import { CustomerApi } from '@/api/customer.api';
import { AdminCatalogApi } from '@/api/adminCatalog.api';
import { SystemApi } from '@/api/system.api';
import { asAdmin, registerFreshCustomer, signOutLocally } from './helpers';

/** Fields that must never appear in anything a customer can fetch. */
const FORBIDDEN_FIELDS = [
  'costPrice',
  'cost_price',
  'costPriceCents',
  'marginPerUnit',
  'profit',
  'supplier',
  'supplierId',
  'minimumStock',
  'stockValue',
  'passwordHash',
  'password_hash',
  'previousQuantity',
  'referenceType',
  'auditLog',
];

describe('protected data is never exposed to customers', () => {
  it('keeps cost price and internals out of the public product list', async () => {
    signOutLocally();
    const products = await CatalogApi.listProducts({ limit: 20 });
    const serialised = JSON.stringify(products);

    for (const field of FORBIDDEN_FIELDS) {
      expect(serialised, `public product list must not contain "${field}"`).not.toContain(field);
    }
  });

  it('keeps cost price out of the public product detail', async () => {
    signOutLocally();
    const list = await CatalogApi.listProducts({ limit: 1 });
    const detail = await CatalogApi.getProduct(list.items[0]!.id);
    const serialised = JSON.stringify(detail);

    for (const field of FORBIDDEN_FIELDS) {
      expect(serialised, `public product detail must not contain "${field}"`).not.toContain(field);
    }
  });

  it('shows admins the cost price the customer payload omits', async () => {
    const products = await asAdmin(() => AdminCatalogApi.listProducts({ limit: 1 }));
    const variant = products.items[0]!.variants[0]!;

    expect(typeof variant.costPrice).toBe('number');
    expect(typeof variant.marginPerUnit).toBe('number');
    expect(variant.marginPerUnit).toBeCloseTo(variant.sellingPrice - variant.costPrice, 2);
  });

  it('hides exact stock from customers unless the store enables it', async () => {
    const original = (await asAdmin(() => SystemApi.getSettings()))['customer.expose_exact_stock'];

    await asAdmin(() => SystemApi.updateSettings({ 'customer.expose_exact_stock': 'false' }));
    signOutLocally();
    const hidden = await CatalogApi.listProducts({ limit: 3 });
    for (const product of hidden.items) {
      for (const variant of product.variants) {
        expect(variant.quantity).toBeUndefined();
        expect(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']).toContain(variant.availability);
      }
    }

    await asAdmin(() => SystemApi.updateSettings({ 'customer.expose_exact_stock': 'true' }));
    signOutLocally();
    const shown = await CatalogApi.listProducts({ limit: 3 });
    expect(shown.items.some((p) => p.variants.some((v) => typeof v.quantity === 'number'))).toBe(true);

    await asAdmin(() => SystemApi.updateSettings({ 'customer.expose_exact_stock': original ?? 'false' }));
  });

  it("never leaks another customer's identity through an order payload", async () => {
    await registerFreshCustomer();
    const products = await CatalogApi.listProducts({ limit: 5, availability: 'IN_STOCK' });
    const variant = products.items.flatMap((p) => p.variants).find((v) => v.inStock)!;
    const order = await CustomerApi.placeOrder({ items: [{ variantId: variant.id, quantity: 1 }] });

    const serialised = JSON.stringify(order);
    // The customer projection carries no staff identity or internal commitment flag.
    expect(serialised).not.toContain('createdBy');
    expect(serialised).not.toContain('stockCommitted');
    expect(serialised).not.toContain('customerId');
  });

  it('cannot reach inventory transactions or audit logs as a customer', async () => {
    await registerFreshCustomer();

    const endpoints = ['/admin/inventory/transactions', '/admin/audit-logs', '/admin/reports/profit'];
    for (const path of endpoints) {
      const response = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
        headers: { Authorization: `Bearer ${await currentAccessToken()}` },
      });
      expect(response.status, path).toBe(403);
    }
  });
});

async function currentAccessToken(): Promise<string> {
  const { tokenStore } = await import('@/lib/apiClient');
  return tokenStore.getAccessToken() ?? '';
}
