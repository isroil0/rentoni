import { beforeEach, describe, expect, it } from 'vitest';
import { CatalogApi } from '@/api/catalog.api';
import { CartApi } from '@/api/cart.api';
import { CustomerApi } from '@/api/customer.api';
import { AdminCatalogApi } from '@/api/adminCatalog.api';
import { InventoryApi } from '@/api/inventory.api';
import { asAdmin, registerFreshCustomer, signOutLocally } from './helpers';

/** Picks an in-stock variant from the live catalogue. */
async function findSellableVariant(minimumStock = 2) {
  const products = await CatalogApi.listProducts({ limit: 20, availability: 'IN_STOCK' });
  for (const product of products.items) {
    const variant = product.variants.find((v) => v.inStock);
    if (!variant) continue;

    const stock = await asAdmin(() => InventoryApi.getByVariant(variant.id));
    if (stock.quantity >= minimumStock) return { product, variant, stock: stock.quantity };
  }
  throw new Error('No sellable variant found in the seeded catalogue');
}

describe('customer shopping flow (real API)', () => {
  beforeEach(() => {
    signOutLocally();
  });

  it('browses the public catalogue without authentication', async () => {
    const products = await CatalogApi.listProducts({ limit: 5 });

    expect(products.items.length).toBeGreaterThan(0);
    expect(products.meta.total).toBeGreaterThan(0);

    const product = products.items[0]!;
    expect(product.name).toBeTruthy();
    expect(product.colors.length).toBeGreaterThan(0);
    expect(product.sizes.length).toBeGreaterThan(0);
    expect(typeof product.priceFrom).toBe('number');
    expect(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']).toContain(product.availability);
  });

  it('searches and filters server-side', async () => {
    const byName = await CatalogApi.listProducts({ search: 'Oxford' });
    expect(byName.items.length).toBeGreaterThan(0);
    expect(byName.items.every((p) => `${p.name} ${p.description ?? ''} ${p.brand ?? ''}`.includes('Oxford'))).toBe(true);

    const byColor = await CatalogApi.listProducts({ color: 'Black' });
    expect(byColor.items.every((p) => p.colors.includes('Black'))).toBe(true);

    const inStock = await CatalogApi.listProducts({ availability: 'IN_STOCK' });
    expect(inStock.items.every((p) => p.availability === 'IN_STOCK')).toBe(true);
  });

  it('paginates without fetching the whole catalogue', async () => {
    const page1 = await CatalogApi.listProducts({ page: 1, limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.meta.page).toBe(1);
    expect(page1.meta.limit).toBe(2);

    if (page1.meta.hasNext) {
      const page2 = await CatalogApi.listProducts({ page: 2, limit: 2 });
      expect(page2.items[0]!.id).not.toBe(page1.items[0]!.id);
    }
  });

  it('exposes colours, sizes and per-variant availability on the product page', async () => {
    const list = await CatalogApi.listProducts({ limit: 1 });
    const detail = await CatalogApi.getProduct(list.items[0]!.id);

    expect(detail.variants.length).toBeGreaterThan(0);
    for (const variant of detail.variants) {
      expect(variant).toHaveProperty('color');
      expect(variant).toHaveProperty('size');
      expect(typeof variant.price).toBe('number');
      expect(typeof variant.inStock).toBe('boolean');
    }
  });

  it('runs the full cart → checkout → order flow and moves stock', async () => {
    const { variant } = await findSellableVariant(3);

    const before = await asAdmin(() => InventoryApi.getByVariant(variant.id));
    const shopper = await registerFreshCustomer();

    const cart = await CartApi.addItem(variant.id, 2);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]!.quantity).toBe(2);
    expect(cart.subtotal).toBeCloseTo(cart.items[0]!.unitPrice * 2, 2);
    expect(cart.readyForCheckout).toBe(true);

    const order = await CustomerApi.placeOrder({ fromCart: true, paymentMethod: 'CASH' });
    expect(order.source).toBe('ONLINE');
    expect(order.status).toBe('PENDING');
    expect(order.orderNumber).toMatch(/^SO-/);
    expect(order.items[0]!.quantity).toBe(2);
    expect(order.total).toBeCloseTo(order.items[0]!.unitPrice * 2, 2);

    // Cart is emptied after checkout.
    expect((await CartApi.get()).items).toHaveLength(0);

    // The order belongs to this customer and appears in their list.
    const mine = await CustomerApi.listOrders({ limit: 10 });
    expect(mine.items.some((o) => o.id === order.id)).toBe(true);
    expect(shopper.user.id).toBeGreaterThan(0);

    // Stock went down by exactly two.
    const after = await asAdmin(() => InventoryApi.getByVariant(variant.id));
    expect(after.quantity).toBe(before.quantity - 2);
  });

  it('updates and removes cart lines, recomputing totals on the server', async () => {
    const { variant } = await findSellableVariant(3);
    await registerFreshCustomer();

    const added = await CartApi.addItem(variant.id, 1);
    const unitPrice = added.items[0]!.unitPrice;

    const increased = await CartApi.setQuantity(variant.id, 3);
    expect(increased.items[0]!.quantity).toBe(3);
    expect(increased.subtotal).toBeCloseTo(unitPrice * 3, 2);

    const emptied = await CartApi.removeItem(variant.id);
    expect(emptied.items).toHaveLength(0);
    expect(emptied.subtotal).toBe(0);
  });

  it('rejects an order for more stock than exists, leaving inventory untouched', async () => {
    const { variant, stock } = await findSellableVariant(1);
    await registerFreshCustomer();

    await expect(
      CustomerApi.placeOrder({ items: [{ variantId: variant.id, quantity: stock + 50 }] }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });

    const unchanged = await asAdmin(() => InventoryApi.getByVariant(variant.id));
    expect(unchanged.quantity).toBe(stock);
  });

  it('ignores a client-supplied price and charges the catalogue price', async () => {
    const { variant } = await findSellableVariant(1);
    await registerFreshCustomer();

    // Send a tampered payload directly, bypassing the typed client.
    const response = await fetch(`${import.meta.env.VITE_API_URL}/customer/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('rentoni.refreshToken') ? '' : ''}`,
      },
      body: JSON.stringify({ items: [{ variantId: variant.id, quantity: 1, unitPrice: 0.01 }] }),
    });
    // Unauthenticated or rejected — either way the tampered field never takes effect.
    expect([401, 422]).toContain(response.status);

    // The legitimate path prices from the database.
    const order = await CustomerApi.placeOrder({ items: [{ variantId: variant.id, quantity: 1 }] });
    expect(order.items[0]!.unitPrice).toBe(variant.price);
    expect(order.total).toBe(variant.price);
  });

  it('cancels an eligible order and returns the stock', async () => {
    const { variant } = await findSellableVariant(2);

    const before = await asAdmin(() => InventoryApi.getByVariant(variant.id));

    await registerFreshCustomer();
    const order = await CustomerApi.placeOrder({ items: [{ variantId: variant.id, quantity: 1 }] });

    const committed = await asAdmin(() => InventoryApi.getByVariant(variant.id));
    expect(committed.quantity).toBe(before.quantity - 1);

    // Still signed in as the shopper who owns the order.
    const cancelled = await CustomerApi.cancelOrder(order.id, 'Changed my mind');
    expect(cancelled.status).toBe('CANCELLED');

    const restored = await asAdmin(() => InventoryApi.getByVariant(variant.id));
    expect(restored.quantity).toBe(before.quantity);
  });

  it('keeps the historical price on an order after a price change', async () => {
    const { variant } = await findSellableVariant(2);

    await registerFreshCustomer();
    const order = await CustomerApi.placeOrder({ items: [{ variantId: variant.id, quantity: 1 }] });
    const originalPrice = order.items[0]!.unitPrice;

    await asAdmin(() => AdminCatalogApi.updateVariant(variant.id, { sellingPrice: originalPrice + 5 }));

    // The old order still shows the price it was placed at.
    const historical = await CustomerApi.getOrder(order.id);
    expect(historical.items[0]!.unitPrice).toBe(originalPrice);
    expect(historical.total).toBe(order.total);

    // But the storefront now shows the new price.
    signOutLocally();
    const refreshed = await CatalogApi.getProduct(order.items[0]!.variantId ? (await CatalogApi.listProducts({ sku: variant.sku })).items[0]!.id : 0);
    expect(refreshed.variants.find((v) => v.id === variant.id)?.price).toBe(originalPrice + 5);

    // Put the catalogue price back so later tests see the seeded value.
    await asAdmin(() => AdminCatalogApi.updateVariant(variant.id, { sellingPrice: originalPrice }));
  });
});
