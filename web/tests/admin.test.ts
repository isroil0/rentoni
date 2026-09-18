import { beforeEach, describe, expect, it } from 'vitest';
import { PosApi } from '@/api/pos.api';
import { InventoryApi } from '@/api/inventory.api';
import { PurchasesApi } from '@/api/purchases.api';
import { SuppliersApi } from '@/api/suppliers.api';
import { ReturnsApi } from '@/api/returns.api';
import { OrdersApi } from '@/api/orders.api';
import { ReportsApi } from '@/api/reports.api';
import { SystemApi } from '@/api/system.api';
import { AdminCatalogApi } from '@/api/adminCatalog.api';
import { CustomersApi } from '@/api/customers.api';
import { signInAsAdmin } from './helpers';

/** A variant with enough stock for the test to play with. */
async function pickVariant(minimum = 5) {
  const inventory = await InventoryApi.list({ limit: 50, status: 'IN_STOCK' });
  const row = inventory.items.find((item) => item.quantity >= minimum);
  if (!row) throw new Error('No variant with sufficient stock in the seeded data');
  return row;
}

describe('admin operations (real API)', () => {
  beforeEach(async () => {
    await signInAsAdmin();
  });

  describe('POS', () => {
    it('searches by product name, SKU and barcode', async () => {
      const byName = await PosApi.search('Oxford');
      expect(byName.length).toBeGreaterThan(0);

      const first = byName[0]!;
      const bySku = await PosApi.search(first.sku);
      expect(bySku.some((r) => r.variantId === first.variantId)).toBe(true);

      if (first.barcode) {
        const byBarcode = await PosApi.search(first.barcode);
        expect(byBarcode.some((r) => r.variantId === first.variantId)).toBe(true);
      }
    });

    it('quotes totals server-side without writing anything', async () => {
      const row = await pickVariant(3);
      const before = await InventoryApi.getByVariant(row.variantId);

      const quote = await PosApi.quote([{ variantId: row.variantId, quantity: 2 }]);

      expect(quote.items).toHaveLength(1);
      expect(quote.subtotal).toBeCloseTo(quote.items[0]!.unitPrice * 2, 2);
      expect(quote.total).toBe(quote.subtotal - quote.discount);
      expect(quote.canComplete).toBe(true);

      const after = await InventoryApi.getByVariant(row.variantId);
      expect(after.quantity).toBe(before.quantity);
    });

    it('applies a discount server-side', async () => {
      const row = await pickVariant(2);
      const plain = await PosApi.quote([{ variantId: row.variantId, quantity: 2 }]);
      const discounted = await PosApi.quote([{ variantId: row.variantId, quantity: 2 }], { discountPercent: 10 });

      expect(discounted.discount).toBeCloseTo(plain.subtotal * 0.1, 2);
      expect(discounted.total).toBeCloseTo(plain.subtotal * 0.9, 2);
    });

    it('completes a sale, decreasing stock and writing an inventory transaction', async () => {
      const row = await pickVariant(3);
      const before = await InventoryApi.getByVariant(row.variantId);

      const order = await PosApi.createOrder({
        items: [{ variantId: row.variantId, quantity: 2 }],
        paymentMethod: 'CASH',
        completeNow: true,
      });

      expect(order.source).toBe('POS');
      expect(order.status).toBe('COMPLETED');
      expect(order.paymentStatus).toBe('PAID');
      expect(order.orderNumber).toMatch(/^POS-/);
      expect(order.customerId).toBeNull();

      const after = await InventoryApi.getByVariant(row.variantId);
      expect(after.quantity).toBe(before.quantity - 2);

      const transactions = await InventoryApi.transactions({
        variantId: row.variantId,
        referenceType: 'ORDER',
        referenceId: order.id,
      });
      expect(transactions.items).toHaveLength(1);
      expect(transactions.items[0]).toMatchObject({
        type: 'SALE',
        quantity: -2,
        previousQuantity: before.quantity,
        newQuantity: before.quantity - 2,
      });
    });

    it('rejects a sale larger than available stock and leaves stock intact', async () => {
      const row = await pickVariant(1);
      const before = await InventoryApi.getByVariant(row.variantId);

      await expect(
        PosApi.createOrder({
          items: [{ variantId: row.variantId, quantity: before.quantity + 10 }],
          completeNow: true,
        }),
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });

      expect((await InventoryApi.getByVariant(row.variantId)).quantity).toBe(before.quantity);
    });

    it('produces a receipt for a completed sale', async () => {
      const row = await pickVariant(2);
      const order = await PosApi.createOrder({
        items: [{ variantId: row.variantId, quantity: 1 }],
        paymentMethod: 'CARD',
        completeNow: true,
      });

      const receipt = await PosApi.receipt(order.id);
      expect(receipt.orderNumber).toBe(order.orderNumber);
      expect(receipt.items).toHaveLength(1);
      expect(receipt.total).toBe(order.total);
      expect(receipt.paymentMethod).toBe('CARD');
    });
  });

  describe('inventory', () => {
    it('adjusts stock and records the movement', async () => {
      const row = await pickVariant(5);
      const before = await InventoryApi.getByVariant(row.variantId);

      const result = await InventoryApi.adjust({
        variantId: row.variantId,
        type: 'ADJUSTMENT_IN',
        quantity: 5,
        note: 'Web test top-up',
      });

      expect(result.previousQuantity).toBe(before.quantity);
      expect(result.quantity).toBe(before.quantity + 5);

      const history = await InventoryApi.transactions({ variantId: row.variantId, limit: 1 });
      expect(history.items[0]).toMatchObject({ type: 'ADJUSTMENT_IN', quantity: 5, note: 'Web test top-up' });

      // Put it back.
      await InventoryApi.adjust({ variantId: row.variantId, type: 'ADJUSTMENT_OUT', quantity: 5 });
    });

    it('refuses an adjustment that would drive stock negative', async () => {
      const row = await pickVariant(1);
      const before = await InventoryApi.getByVariant(row.variantId);

      await expect(
        InventoryApi.adjust({ variantId: row.variantId, type: 'ADJUSTMENT_OUT', quantity: before.quantity + 100 }),
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });

      expect((await InventoryApi.getByVariant(row.variantId)).quantity).toBe(before.quantity);
    });

    it('reports LOW_STOCK and OUT_OF_STOCK exactly as the backend defines them', async () => {
      const row = await pickVariant(5);
      const original = (await InventoryApi.getByVariant(row.variantId)).quantity;
      const minimum = row.minimumStock;

      // quantity === minimumStock is LOW_STOCK.
      await InventoryApi.adjust({ variantId: row.variantId, setQuantity: minimum });
      expect((await InventoryApi.getByVariant(row.variantId)).status).toBe('LOW_STOCK');

      await InventoryApi.adjust({ variantId: row.variantId, setQuantity: 0 });
      expect((await InventoryApi.getByVariant(row.variantId)).status).toBe('OUT_OF_STOCK');

      await InventoryApi.adjust({ variantId: row.variantId, setQuantity: original });
      expect((await InventoryApi.getByVariant(row.variantId)).status).toBe('IN_STOCK');
    });

    it('lists low-stock and out-of-stock variants', async () => {
      const low = await InventoryApi.lowStock({ limit: 20 });
      expect(low.items.every((item) => item.quantity <= item.minimumStock)).toBe(true);

      const out = await InventoryApi.outOfStock({ limit: 20 });
      expect(out.items.every((item) => item.quantity === 0)).toBe(true);
    });
  });

  describe('purchasing', () => {
    it('creates a purchase, receives it once, and increases stock', async () => {
      const suppliers = await SuppliersApi.list({ limit: 1, active: true });
      const supplier = suppliers.items[0]!;
      const row = await pickVariant(1);
      const before = await InventoryApi.getByVariant(row.variantId);

      const purchase = await PurchasesApi.create({
        supplierId: supplier.id,
        items: [{ variantId: row.variantId, quantity: 20, unitCost: 18 }],
        note: 'Web test purchase',
      });

      expect(purchase.status).toBe('DRAFT');
      expect(purchase.totalCost).toBe(360);
      // A draft must not move stock.
      expect((await InventoryApi.getByVariant(row.variantId)).quantity).toBe(before.quantity);

      const received = await PurchasesApi.receive(purchase.id);
      expect(received.status).toBe('RECEIVED');
      expect((await InventoryApi.getByVariant(row.variantId)).quantity).toBe(before.quantity + 20);

      // Receiving twice is refused, so stock cannot be double-counted.
      await expect(PurchasesApi.receive(purchase.id)).rejects.toMatchObject({
        code: 'PURCHASE_ALREADY_RECEIVED',
      });
      expect((await InventoryApi.getByVariant(row.variantId)).quantity).toBe(before.quantity + 20);

      const transactions = await InventoryApi.transactions({
        referenceType: 'PURCHASE',
        referenceId: purchase.id,
      });
      expect(transactions.items[0]).toMatchObject({ type: 'PURCHASE', quantity: 20 });

      // Reset stock for the rest of the suite.
      await InventoryApi.adjust({ variantId: row.variantId, setQuantity: before.quantity });
    });

    it('manages suppliers', async () => {
      const created = await SuppliersApi.create({ name: `Web Test Supplier ${Date.now()}`, phone: '+15550009999' });
      expect(created.active).toBe(true);

      const updated = await SuppliersApi.update(created.id, { address: '1 Test Street' });
      expect(updated.address).toBe('1 Test Street');

      const removed = await SuppliersApi.remove(created.id);
      expect(removed.deactivated).toBe(true);
    });
  });

  describe('returns', () => {
    it('returns an item against a completed sale and restores stock', async () => {
      const row = await pickVariant(4);
      const before = await InventoryApi.getByVariant(row.variantId);

      const order = await PosApi.createOrder({
        items: [{ variantId: row.variantId, quantity: 3 }],
        paymentMethod: 'CASH',
        completeNow: true,
      });
      expect((await InventoryApi.getByVariant(row.variantId)).quantity).toBe(before.quantity - 3);

      const eligibility = await ReturnsApi.eligibility(order.id);
      expect(eligibility.returnable).toBe(true);
      expect(eligibility.lines[0]!.eligible).toBe(3);

      const created = await ReturnsApi.create({
        orderId: order.id,
        items: [{ variantId: row.variantId, quantity: 1 }],
        reason: 'Wrong size',
        autoAccept: true,
      });

      expect(created[0]!.status).toBe('ACCEPTED');
      expect((await InventoryApi.getByVariant(row.variantId)).quantity).toBe(before.quantity - 2);

      const transactions = await InventoryApi.transactions({ referenceType: 'RETURN', referenceId: created[0]!.id });
      expect(transactions.items[0]).toMatchObject({ type: 'RETURN', quantity: 1 });

      // Reset.
      await InventoryApi.adjust({ variantId: row.variantId, setQuantity: before.quantity });
    });

    it('refuses to return more than was purchased', async () => {
      const row = await pickVariant(3);
      const order = await PosApi.createOrder({
        items: [{ variantId: row.variantId, quantity: 1 }],
        completeNow: true,
      });

      await expect(
        ReturnsApi.create({ orderId: order.id, items: [{ variantId: row.variantId, quantity: 5 }] }),
      ).rejects.toMatchObject({ code: 'INVALID_RETURN_QUANTITY' });
    });
  });

  describe('orders and reports', () => {
    it('filters sales by source and status', async () => {
      const pos = await OrdersApi.list({ source: 'POS', limit: 10 });
      expect(pos.items.every((order) => order.source === 'POS')).toBe(true);

      const online = await OrdersApi.list({ source: 'ONLINE', limit: 10 });
      expect(online.items.every((order) => order.source === 'ONLINE')).toBe(true);
    });

    it('returns backend-calculated report figures', async () => {
      const dashboard = await ReportsApi.dashboard({ preset: 'today' });
      expect(dashboard.sales).toHaveProperty('revenue');
      expect(dashboard.inventory).toHaveProperty('totalUnits');
      expect(dashboard.customers).toHaveProperty('total');

      const sales = await ReportsApi.sales({ preset: 'month' });
      expect(Array.isArray(sales.byDay)).toBe(true);
      expect(sales.totals.profit).toBeCloseTo(sales.totals.revenue - sales.totals.costOfGoods, 2);

      const inventory = await ReportsApi.inventory();
      expect(inventory.totals.totalUnits).toBeGreaterThan(0);

      const profit = await ReportsApi.profit({ preset: 'month' });
      expect(profit.totals).toHaveProperty('marginPercent');
    });

    it('records administrative actions in the audit log', async () => {
      const row = await pickVariant(2);
      await InventoryApi.adjust({ variantId: row.variantId, type: 'ADJUSTMENT_IN', quantity: 1, note: 'Audit probe' });

      const logs = await SystemApi.auditLogs({ action: 'INVENTORY_ADJUSTED', limit: 5 });
      expect(logs.items.length).toBeGreaterThan(0);
      expect(logs.items[0]!.entityType).toBe('ProductVariant');

      // No credential material is ever written to the trail.
      const serialised = JSON.stringify(logs.items);
      expect(serialised).not.toContain('passwordHash');
      expect(serialised).not.toContain('Admin@12345');

      await InventoryApi.adjust({ variantId: row.variantId, type: 'ADJUSTMENT_OUT', quantity: 1 });
    });

    it('reads and writes only the settings the backend supports', async () => {
      const settings = await SystemApi.getSettings();
      expect(settings).toHaveProperty('store.name');
      expect(settings).toHaveProperty('store.currency');
      expect(settings).toHaveProperty('customer.expose_exact_stock');

      const updated = await SystemApi.updateSettings({ 'store.name': 'Rentoni Shirts' });
      expect(updated['store.name']).toBe('Rentoni Shirts');
    });

    it('lists customers with order counts and lifetime spend', async () => {
      const customers = await CustomersApi.list({ limit: 5 });
      expect(customers.items.length).toBeGreaterThan(0);
      for (const customer of customers.items) {
        expect(customer.role).toBe('CUSTOMER');
        expect(customer).toHaveProperty('orderCount');
        expect(customer).toHaveProperty('totalSpent');
        expect(customer).not.toHaveProperty('passwordHash');
      }
    });
  });

  describe('catalogue management', () => {
    it('creates a product with a full variant matrix, then rejects a duplicate SKU', async () => {
      const categories = await AdminCatalogApi.listCategories({ limit: 1 });
      const stamp = Date.now();

      const product = await AdminCatalogApi.createProduct({
        categoryId: categories.items[0]!.id,
        name: `Web Test Shirt ${stamp}`,
        brand: 'Rentoni',
        variants: [
          { sku: `WT${stamp}-W-S`, color: 'White', size: 'S', costPrice: 10, sellingPrice: 20, minimumStock: 2, initialStock: 5 },
          { sku: `WT${stamp}-W-M`, color: 'White', size: 'M', costPrice: 10, sellingPrice: 20, minimumStock: 2, initialStock: 5 },
        ],
      });

      expect(product.variantCount).toBe(2);
      expect(product.totalStock).toBe(10);

      await expect(
        AdminCatalogApi.createVariant(product.id, {
          sku: `WT${stamp}-W-S`,
          color: 'Black',
          size: 'L',
          costPrice: 10,
          sellingPrice: 20,
        }),
      ).rejects.toMatchObject({ code: 'DUPLICATE_SKU' });

      await expect(
        AdminCatalogApi.createVariant(product.id, {
          sku: `WT${stamp}-W-S2`,
          color: 'White',
          size: 'S',
          costPrice: 10,
          sellingPrice: 20,
        }),
      ).rejects.toMatchObject({ code: 'DUPLICATE_VARIANT' });

      await AdminCatalogApi.deleteProduct(product.id);
    });
  });
});
