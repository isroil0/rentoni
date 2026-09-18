import { beforeEach, describe, expect, it } from 'vitest';
import { API, app, as, createAdmin, createCatalogue, prisma, request, resetCatalogue } from './helpers';

describe('products, variants and images', () => {
  it('creates a product together with its whole variant matrix', async () => {
    const admin = await createAdmin();
    const category = await prisma.category.create({ data: { name: 'Formal Shirts' } });

    const res = await request(app())
      .post(`${API}/admin/products`)
      .set(as(admin))
      .send({
        categoryId: category.id,
        name: 'Oxford Classic Shirt',
        description: 'Timeless Oxford',
        brand: 'Rentoni',
        images: [{ url: 'https://cdn.test/oxford.jpg', altText: 'Oxford', isPrimary: true }],
        variants: [
          { sku: 'OXF-W-S', color: 'White', size: 'S', costPrice: 18, sellingPrice: 30, minimumStock: 5, initialStock: 10 },
          { sku: 'OXF-W-M', color: 'White', size: 'M', costPrice: 18, sellingPrice: 30, minimumStock: 5, initialStock: 20 },
          { sku: 'OXF-B-M', color: 'Black', size: 'M', costPrice: 18, sellingPrice: 30, minimumStock: 5 },
        ],
      })
      .expect(201);

    expect(res.body.data.variantCount).toBe(3);
    expect(res.body.data.totalStock).toBe(30);
    expect(res.body.data.images).toHaveLength(1);

    // Every variant received exactly one inventory row.
    const inventoryRows = await prisma.inventory.count({
      where: { variant: { productId: res.body.data.id } },
    });
    expect(inventoryRows).toBe(3);

    // Opening stock was recorded as inventory transactions, not written silently.
    const txns = await prisma.inventoryTransaction.findMany({
      where: { variant: { productId: res.body.data.id } },
    });
    expect(txns).toHaveLength(2);
    expect(txns.every((t) => t.type === 'ADJUSTMENT_IN')).toBe(true);
  });

  it('rejects a duplicate SKU', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'DUP-W-M' });

    const res = await request(app())
      .post(`${API}/admin/variants`)
      .set(as(admin))
      .send({
        productId: fixture.productId,
        sku: 'DUP-W-M',
        color: 'Black',
        size: 'L',
        costPrice: 18,
        sellingPrice: 30,
      })
      .expect(409);
    expect(res.body.error.code).toBe('DUPLICATE_SKU');
  });

  it('rejects a duplicate colour + size combination on the same product', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'COMBO-W-M', color: 'White', size: 'M' });

    const res = await request(app())
      .post(`${API}/admin/variants`)
      .set(as(admin))
      .send({
        productId: fixture.productId,
        sku: 'COMBO-W-M-2',
        color: 'White',
        size: 'M',
        costPrice: 18,
        sellingPrice: 30,
      })
      .expect(409);
    expect(res.body.error.code).toBe('DUPLICATE_VARIANT');

    expect(await prisma.productVariant.count({ where: { productId: fixture.productId } })).toBe(1);
  });

  it('rejects a duplicate barcode', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'BAR-W-M' });
    const existing = await prisma.productVariant.findUniqueOrThrow({ where: { id: fixture.variantId } });

    const res = await request(app())
      .post(`${API}/admin/variants`)
      .set(as(admin))
      .send({
        productId: fixture.productId,
        sku: 'BAR-B-M',
        barcode: existing.barcode,
        color: 'Black',
        size: 'M',
        costPrice: 18,
        sellingPrice: 30,
      })
      .expect(409);
    expect(res.body.error.code).toBe('DUPLICATE_BARCODE');
  });

  it('allows the same colour + size on a different product', async () => {
    const admin = await createAdmin();
    const a = await createCatalogue({ sku: 'P1-W-M', productName: 'Shirt A' });
    const b = await createCatalogue({ sku: 'P2-W-M', productName: 'Shirt B' });
    expect(a.productId).not.toBe(b.productId);

    await request(app())
      .post(`${API}/admin/variants`)
      .set(as(admin))
      .send({ productId: b.productId, sku: 'P2-W-L', color: 'White', size: 'L', costPrice: 1, sellingPrice: 2 })
      .expect(201);
  });

  it('updates a product', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'UPD-W-M' });

    const res = await request(app())
      .put(`${API}/admin/products/${fixture.productId}`)
      .set(as(admin))
      .send({ name: 'Renamed Shirt', brand: 'New Brand' })
      .expect(200);

    expect(res.body.data.name).toBe('Renamed Shirt');
    expect(res.body.data.brand).toBe('New Brand');
  });

  it('records a price change in the audit log without touching history', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'PRC-W-M', sellingPrice: 30 });

    await request(app())
      .put(`${API}/admin/variants/${fixture.variantId}`)
      .set(as(admin))
      .send({ sellingPrice: 35 })
      .expect(200);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'PRICE_CHANGED', entityId: String(fixture.variantId) },
    });
    expect(audit).toBeTruthy();
    expect(JSON.parse(audit!.oldValue!).sellingPrice).toBe(30);
    expect(JSON.parse(audit!.newValue!).sellingPrice).toBe(35);
  });

  it('validates input on create', async () => {
    const admin = await createAdmin();
    const category = await prisma.category.create({ data: { name: 'Validation Cat' } });

    const negativePrice = await request(app())
      .post(`${API}/admin/products`)
      .set(as(admin))
      .send({
        categoryId: category.id,
        name: 'Bad Shirt',
        variants: [{ sku: 'BAD-W-M', color: 'White', size: 'M', costPrice: -5, sellingPrice: 30 }],
      })
      .expect(422);
    expect(negativePrice.body.error.code).toBe('VALIDATION_ERROR');

    await request(app())
      .post(`${API}/admin/products`)
      .set(as(admin))
      .send({ categoryId: 999999, name: 'Orphan Shirt' })
      .expect(404);

    await request(app())
      .post(`${API}/admin/products`)
      .set(as(admin))
      .send({ categoryId: category.id, name: 'X' })
      .expect(422);
  });

  it('soft-deletes a product that has sales history and refuses a hard delete', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'DEL-W-M', stock: 5 });

    await request(app())
      .post(`${API}/admin/pos/orders`)
      .set(as(admin))
      .send({ items: [{ variantId: fixture.variantId, quantity: 1 }], completeNow: true })
      .expect(201);

    const hard = await request(app())
      .delete(`${API}/admin/products/${fixture.productId}?hard=true`)
      .set(as(admin))
      .expect(409);
    expect(hard.body.error.code).toBe('CONFLICT');

    const soft = await request(app())
      .delete(`${API}/admin/products/${fixture.productId}`)
      .set(as(admin))
      .expect(200);
    expect(soft.body.data.deactivated).toBe(true);

    const product = await prisma.product.findUniqueOrThrow({ where: { id: fixture.productId } });
    expect(product.active).toBe(false);
    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: fixture.variantId } });
    expect(variant.active).toBe(false);
  });

  it('manages product images and the primary flag', async () => {
    const admin = await createAdmin();
    const fixture = await createCatalogue({ sku: 'IMG-W-M' });

    const added = await request(app())
      .post(`${API}/admin/products/${fixture.productId}/images`)
      .set(as(admin))
      .send({
        images: [
          { url: 'https://cdn.test/a.jpg', altText: 'A', isPrimary: true },
          { url: 'https://cdn.test/b.jpg', altText: 'B', sortOrder: 1 },
        ],
      })
      .expect(201);
    expect(added.body.data).toHaveLength(2);
    expect(added.body.data.filter((i: { isPrimary: boolean }) => i.isPrimary)).toHaveLength(1);

    const second = added.body.data.find((i: { altText: string }) => i.altText === 'B');
    await request(app())
      .post(`${API}/admin/products/${fixture.productId}/images/${second.id}/primary`)
      .set(as(admin))
      .expect(200);

    const primaries = await prisma.productImage.count({
      where: { productId: fixture.productId, isPrimary: true },
    });
    expect(primaries).toBe(1);

    await request(app())
      .delete(`${API}/admin/products/${fixture.productId}/images/${second.id}`)
      .set(as(admin))
      .expect(200);
    expect(await prisma.productImage.count({ where: { productId: fixture.productId } })).toBe(1);
  });

  describe('search, filtering and pagination', () => {
    // These assertions count rows, so each one starts from an empty catalogue.
    beforeEach(resetCatalogue);

    it('filters the public catalogue by name, colour, size, price and availability', async () => {
      const white = await createCatalogue({ sku: 'SRCH-W-M', color: 'White', size: 'M', sellingPrice: 30, stock: 10, productName: 'Oxford Classic Shirt' });
      await createCatalogue({ sku: 'SRCH-B-L', color: 'Black', size: 'L', sellingPrice: 65, stock: 0, productName: 'Premium Formal Shirt' });

      const byName = await request(app()).get(`${API}/products?search=Oxford`).expect(200);
      expect(byName.body.data).toHaveLength(1);
      expect(byName.body.data[0].name).toBe('Oxford Classic Shirt');

      const bySku = await request(app()).get(`${API}/products?sku=SRCH-W`).expect(200);
      expect(bySku.body.data[0].id).toBe(white.productId);

      const byColor = await request(app()).get(`${API}/products?color=Black`).expect(200);
      expect(byColor.body.data).toHaveLength(1);

      const bySize = await request(app()).get(`${API}/products?size=M`).expect(200);
      expect(bySize.body.data).toHaveLength(1);

      const byPrice = await request(app()).get(`${API}/products?minPrice=50&maxPrice=80`).expect(200);
      expect(byPrice.body.data).toHaveLength(1);
      expect(byPrice.body.data[0].name).toBe('Premium Formal Shirt');

      const inStock = await request(app()).get(`${API}/products?availability=IN_STOCK`).expect(200);
      expect(inStock.body.data).toHaveLength(1);

      const outOfStock = await request(app()).get(`${API}/products?availability=OUT_OF_STOCK`).expect(200);
      expect(outOfStock.body.data).toHaveLength(1);
    });

    it('finds a variant by barcode', async () => {
      const fixture = await createCatalogue({ sku: 'BCD-W-M', stock: 3 });
      const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: fixture.variantId } });
      const res = await request(app()).get(`${API}/products?barcode=${variant.barcode}`).expect(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('paginates with page and limit', async () => {
      for (let i = 0; i < 5; i += 1) {
        await createCatalogue({ sku: `PAGE-${i}`, productName: `Paged Shirt ${i}`, stock: 1 });
      }
      const page1 = await request(app()).get(`${API}/products?page=1&limit=2`).expect(200);
      expect(page1.body.data).toHaveLength(2);
      expect(page1.body.meta).toMatchObject({ page: 1, limit: 2, total: 5, totalPages: 3, hasNext: true, hasPrev: false });

      const page3 = await request(app()).get(`${API}/products?page=3&limit=2`).expect(200);
      expect(page3.body.data).toHaveLength(1);
      expect(page3.body.meta.hasNext).toBe(false);
    });

    it('excludes inactive products from the public catalogue but not from admin', async () => {
      const admin = await createAdmin();
      const fixture = await createCatalogue({ sku: 'INACT-W-M', productName: 'Hidden Shirt', stock: 5 });
      await prisma.product.update({ where: { id: fixture.productId }, data: { active: false } });

      const publicRes = await request(app()).get(`${API}/products?search=Hidden`).expect(200);
      expect(publicRes.body.data).toHaveLength(0);
      await request(app()).get(`${API}/products/${fixture.productId}`).expect(404);

      const adminRes = await request(app())
        .get(`${API}/admin/products?search=Hidden`)
        .set(as(admin))
        .expect(200);
      expect(adminRes.body.data).toHaveLength(1);
    });
  });
});
