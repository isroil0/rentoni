import { describe, expect, it } from 'vitest';
import { CatalogApi } from '@/api/catalog.api';
import { CustomerApi } from '@/api/customer.api';
import { InventoryApi } from '@/api/inventory.api';
import { PosApi } from '@/api/pos.api';
import { ApiError } from '@/lib/apiClient';
import { asAdmin, registerFreshCustomer, signInAsAdmin } from './helpers';

/**
 * The frontend never tries to solve concurrency itself — these tests verify that it
 * reports the backend's decision honestly and surfaces the right message when another
 * shopper wins the race.
 */
describe('stock concurrency (real API)', () => {
  it('lets only one of two simultaneous buyers take the last unit', async () => {
    // Reduce a real variant to a single unit.
    await signInAsAdmin();
    const inventory = await InventoryApi.list({ limit: 20, status: 'IN_STOCK' });
    const row = inventory.items.find((item) => item.quantity >= 2)!;
    const original = row.quantity;
    await InventoryApi.adjust({ variantId: row.variantId, setQuantity: 1, note: 'Concurrency test' });

    // Two independent shoppers, each with their own token.
    const buyerA = await registerFreshCustomer();
    const buyerB = await registerFreshCustomer();

    async function buy(accessToken: string) {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/customer/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ items: [{ variantId: row.variantId, quantity: 1 }] }),
      });
      return response.status;
    }

    const [statusA, statusB] = await Promise.all([buy(buyerA.accessToken), buy(buyerB.accessToken)]);

    expect([statusA, statusB].sort()).toEqual([201, 409]);

    // Final stock is zero — never negative.
    const after = await asAdmin(() => InventoryApi.getByVariant(row.variantId));
    expect(after.quantity).toBe(0);
    expect(after.status).toBe('OUT_OF_STOCK');

    await asAdmin(() => InventoryApi.adjust({ variantId: row.variantId, setQuantity: original }));
  });

  it('surfaces INSUFFICIENT_STOCK as a friendly, customer-safe message', async () => {
    await signInAsAdmin();
    const inventory = await InventoryApi.list({ limit: 20, status: 'IN_STOCK' });
    const row = inventory.items.find((item) => item.quantity >= 1)!;

    await registerFreshCustomer();
    const products = await CatalogApi.listProducts({ search: row.product.name, limit: 1 });
    expect(products.items.length).toBeGreaterThan(0);

    try {
      // Above available stock, but within the API's per-line maximum, so the rejection
      // is a genuine stock error rather than a validation failure.
      const overQuantity = Math.min(row.quantity + 5, 1000);
      await CustomerApi.placeOrder({ items: [{ variantId: row.variantId, quantity: overQuantity }] });
      throw new Error('expected the order to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.isStockError).toBe(true);

      const { friendlyMessage } = await import('@/lib/apiClient');
      expect(friendlyMessage(apiError)).toBe(
        'Sorry, this item is no longer available in the requested quantity.',
      );
      // The raw backend detail never leaks a stack trace or internal error text.
      expect(JSON.stringify(apiError.details)).not.toContain('prisma');
    }
  });

  it('keeps the POS ticket honest when stock runs out mid-sale', async () => {
    await signInAsAdmin();
    const inventory = await InventoryApi.list({ limit: 20, status: 'IN_STOCK' });
    const row = inventory.items.find((item) => item.quantity >= 2)!;
    const original = row.quantity;

    await InventoryApi.adjust({ variantId: row.variantId, setQuantity: 1 });

    // The quote reflects the shortage before the cashier commits.
    const quote = await PosApi.quote([{ variantId: row.variantId, quantity: 3 }]);
    expect(quote.canComplete).toBe(false);
    expect(quote.availability[0]).toMatchObject({ requested: 3, available: 1, sufficient: false });

    await expect(
      PosApi.createOrder({ items: [{ variantId: row.variantId, quantity: 3 }], completeNow: true }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });

    expect((await InventoryApi.getByVariant(row.variantId)).quantity).toBe(1);
    await InventoryApi.adjust({ variantId: row.variantId, setQuantity: original });
  });
});
