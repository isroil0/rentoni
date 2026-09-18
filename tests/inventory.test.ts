import { describe, expect, it } from 'vitest';
import {
  API,
  app,
  as,
  createAdmin,
  createCatalogue,
  createSupplier,
  prisma,
  request,
  setStock,
  stockOf,
} from './helpers';
import { InventoryService } from '../src/services/inventory.service';

describe('inventory', () => {
  it('receives stock through a purchase and records the transaction', async () => {
    const admin = await createAdmin();
    const supplier = await createSupplier();
    const fixture = await createCatalogue({ sku: 'RCV-W-M', stock: 20 });

    const purchase = await request(app())
      .post(`${API}/admin/purchases`)
      .set(as(admin))
      .send({ supplierId: supplier.id, items: [{ variantId: fixture.variantId, quantity: 20, unitCost: 18 }] })
      .expect(201);
    expect(purchase.body.data.status).toBe('DRAFT');
    expect(purchase.body.data.totalCost).toBe(360);
    // A draft purchase must not move stock.
    expect(await stockOf(fixture.variantId)).toBe(20);

    await request(app())
      .post(`${API}/admin/purchases/${purchase.body.data.id}/receive`)
      .set(as(admin))
      .expect(200);

    expect(await stockOf(fixture.variantId)).toBe(40);

    const tx = await prisma.inventoryTransaction.findFirst({
      where: { variantId: fixture.variantId, type: 'PURCHASE' },
      orderBy: { id: 'desc' },
    });
    expect(tx).toMatchObject({
      quantity: 20,
      previousQuantity: 20,
      newQuantity: 40,
      referenceType: 'PURCHASE',
      referenceId: purchase.body.data.id,
    });
  });

  it('prevents receiving the same purchase twice', async () => {
    const admin = await createAdmin();
    const supplier = await createSupplier();
    const fixture = await createCatalogue({ sku: 'TWICE-W-M', stock: 0 });

    const purchase = await request(app())
      .post(`${API}/admin/purchases`)
      .set(as(admin))
      .send({ supplierId: supplier.id, items: [{ variantId: fixture.variantId, quantity: 10, unitCost: 18 }] })
      .expect(201);

    await request(app()).post(`${API}/admin/purchases/${purchase.body.data.id}/receive`).set(as(admin)).expect(200);
    const second = await request(app())
      .post(`${API}/admin/purchases/${purchase.body.data.id}/receive`)
      .set(as(admin))
      .expect(409);

    expect(second.body.error.code).toBe('PURCHASE_ALREADY_RECEIVED');
    expect(await stockOf(fixture.variantId)).toBe(10);
    expect(
      await prisma.inventoryTransaction.count({ where: { type: 'PURCHASE', variantId: fixture.variantId } }),
    ).toBe(1);
  });

  it('rolls the whole purchase back when one line fails', async () => {
    const admin = await createAdmin();
    const supplier = await createSupplier();
    const good = await createCatalogue({ sku: 'ATOM-W-M', stock: 5 });

    const res = await request(app())
      .post(`${API}/admin/purchases`)
      .set(as(admin))
      .send({
        supplierId: supplier.id,
        items: [
          { variantId: good.variantId, quantity: 10, unitCost: 18 },
          { variantId: 999999, quantity: 5, unitCost: 18 },
        ],
      })
      .expect(404);

    expect(res.body.error.code).toBe('VARIANT_NOT_FOUND');
    expect(await stockOf(good.variantId)).toBe(5);
    expect(await prisma.purchase.count({ where: { supplierId: supplier.id } })).toBe(0);
  });

  it('sells stock and records a SALE transaction', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'SELL-W-M', stock: 40 });

    await request(app())
      .post(`${API}/admin/pos/orders`)
      .set(as(admin))
      .send({ items: [{ variantId: fixture.variantId, quantity: 3 }], completeNow: true })
      .expect(201);

    expect(await stockOf(fixture.variantId)).toBe(37);
    const tx = await prisma.inventoryTransaction.findFirstOrThrow({
      where: { variantId: fixture.variantId, type: 'SALE' },
    });
    expect(tx).toMatchObject({ quantity: -3, previousQuantity: 40, newQuantity: 37, referenceType: 'ORDER' });
  });

  it('applies an adjustment with both relative and absolute forms', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'ADJ-W-M', stock: 38 });

    const absolute = await request(app())
      .post(`${API}/admin/inventory/adjust`)
      .set(as(admin))
      .send({ variantId: fixture.variantId, setQuantity: 35, note: 'Stock count correction' })
      .expect(200);
    expect(absolute.body.data.previousQuantity).toBe(38);
    expect(absolute.body.data.quantity).toBe(35);

    const relative = await request(app())
      .post(`${API}/admin/inventory/adjust`)
      .set(as(admin))
      .send({ variantId: fixture.variantId, type: 'DAMAGE', quantity: 5, note: 'Water damage' })
      .expect(200);
    expect(relative.body.data.quantity).toBe(30);

    const types = (
      await prisma.inventoryTransaction.findMany({
        where: { variantId: fixture.variantId },
        orderBy: { id: 'asc' },
      })
    ).map((t) => t.type);
    expect(types).toEqual(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE']);

    // Adjustments are audited.
    expect(await prisma.auditLog.count({ where: { action: 'INVENTORY_ADJUSTED' } })).toBe(2);
  });

  it('rejects an adjustment that would drive stock negative', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'NEG-W-M', stock: 3 });

    const res = await request(app())
      .post(`${API}/admin/inventory/adjust`)
      .set(as(admin))
      .send({ variantId: fixture.variantId, type: 'ADJUSTMENT_OUT', quantity: 10 })
      .expect(409);

    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.error.details).toMatchObject({ available: 3, requested: 10 });
    expect(await stockOf(fixture.variantId)).toBe(3);
  });

  it('refuses a negative-stock change at the service layer too', async () => {
    const fixture = await createCatalogue({ sku: 'NEG2-W-M', stock: 1 });
    await expect(
      InventoryService.applyChange(prisma, { variantId: fixture.variantId, type: 'SALE', quantity: 2 }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(await stockOf(fixture.variantId)).toBe(1);
  });

  it('is protected by a database CHECK constraint as a last resort', async () => {
    const fixture = await createCatalogue({ sku: 'CHK-W-M', stock: 2 });
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE inventory SET quantity = -5 WHERE variant_id = ${fixture.variantId}`,
      ),
    ).rejects.toThrow(/CHECK constraint/i);
    expect(await stockOf(fixture.variantId)).toBe(2);
  });

  describe('stock status', () => {
    it('reports IN_STOCK, LOW_STOCK and OUT_OF_STOCK correctly', async () => {
      const admin = await createAdmin();
      const fixture = await createCatalogue({ sku: 'STS-W-M', stock: 20, minimumStock: 5 });

      const inStock = await request(app())
        .get(`${API}/admin/inventory/${fixture.variantId}`)
        .set(as(admin))
        .expect(200);
      expect(inStock.body.data.status).toBe('IN_STOCK');

      // quantity === minimumStock is LOW_STOCK (the rule is quantity <= minimumStock).
      await setStock(fixture.variantId, 5);
      const low = await request(app())
        .get(`${API}/admin/inventory/${fixture.variantId}`)
        .set(as(admin))
        .expect(200);
      expect(low.body.data.status).toBe('LOW_STOCK');

      await setStock(fixture.variantId, 4);
      expect(
        (await request(app()).get(`${API}/admin/inventory/${fixture.variantId}`).set(as(admin))).body.data.status,
      ).toBe('LOW_STOCK');

      await setStock(fixture.variantId, 0);
      const out = await request(app())
        .get(`${API}/admin/inventory/${fixture.variantId}`)
        .set(as(admin))
        .expect(200);
      expect(out.body.data.status).toBe('OUT_OF_STOCK');
    });

    it('lists low-stock and out-of-stock variants', async () => {
      const admin = await createAdmin();
      const low = await createCatalogue({ sku: 'LOW-W-M', stock: 3, minimumStock: 5 });
      const out = await createCatalogue({ sku: 'OUT-W-M', stock: 0, minimumStock: 5 });
      const healthy = await createCatalogue({ sku: 'OK-W-M', stock: 50, minimumStock: 5 });

      const lowList = await request(app()).get(`${API}/admin/inventory/low-stock`).set(as(admin)).expect(200);
      const lowIds = lowList.body.data.map((r: { variantId: number }) => r.variantId);
      expect(lowIds).toContain(low.variantId);
      expect(lowIds).toContain(out.variantId);
      expect(lowIds).not.toContain(healthy.variantId);

      const outList = await request(app())
        .get(`${API}/admin/inventory/out-of-stock`)
        .set(as(admin))
        .expect(200);
      const outIds = outList.body.data.map((r: { variantId: number }) => r.variantId);
      expect(outIds).toContain(out.variantId);
      expect(outIds).not.toContain(low.variantId);
      expect(outIds).not.toContain(healthy.variantId);

      const filtered = await request(app())
        .get(`${API}/admin/inventory?status=LOW_STOCK&search=LOW-W-M`)
        .set(as(admin))
        .expect(200);
      expect(filtered.body.data.map((r: { variantId: number }) => r.variantId)).toEqual([low.variantId]);
    });
  });

  it('exposes the full transaction history with references', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'HIST-W-M', stock: 10 });

    await request(app())
      .post(`${API}/admin/pos/orders`)
      .set(as(admin))
      .send({ items: [{ variantId: fixture.variantId, quantity: 2 }], completeNow: true })
      .expect(201);
    await request(app())
      .post(`${API}/admin/inventory/adjust`)
      .set(as(admin))
      .send({ variantId: fixture.variantId, type: 'DAMAGE', quantity: 1 })
      .expect(200);

    const res = await request(app())
      .get(`${API}/admin/inventory/transactions?variantId=${fixture.variantId}`)
      .set(as(admin))
      .expect(200);

    expect(res.body.data).toHaveLength(3);
    // Newest first: DAMAGE, SALE, ADJUSTMENT_IN (opening stock).
    expect(res.body.data.map((t: { type: string }) => t.type)).toEqual(['DAMAGE', 'SALE', 'ADJUSTMENT_IN']);

    // Every row carries a consistent before/after pair.
    for (const t of res.body.data) {
      expect(t.newQuantity).toBe(t.previousQuantity + t.quantity);
    }

    const byType = await request(app())
      .get(`${API}/admin/inventory/transactions?type=SALE&variantId=${fixture.variantId}`)
      .set(as(admin))
      .expect(200);
    expect(byType.body.data).toHaveLength(1);
  });

  it('creates exactly one inventory row per variant', async () => {
    const fixture = await createCatalogue({ sku: 'ONE-W-M', stock: 5 });
    // Calling ensureRecord again must be a no-op.
    await InventoryService.ensureRecord(prisma, fixture.variantId, 999);
    expect(await prisma.inventory.count({ where: { variantId: fixture.variantId } })).toBe(1);
    expect(await stockOf(fixture.variantId)).toBe(5);
  });
});
