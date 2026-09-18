import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { hashPassword } from '../src/utils/password';
import { InventoryService } from '../src/services/inventory.service';
import { toMinor } from '../src/utils/money';

export const API = '/api';

let cachedApp: Express | null = null;
export function app(): Express {
  cachedApp ??= createApp();
  return cachedApp;
}

export interface Session {
  id: number;
  email: string;
  token: string;
  refreshToken: string;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export const as = (session: Session) => auth(session.token);

/** Creates a SUPER_ADMIN directly in the database, then logs in to get a token. */
export async function createAdmin(overrides: { email?: string; password?: string } = {}): Promise<Session> {
  const email = overrides.email ?? `admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const password = overrides.password ?? 'Admin@12345';
  const user = await prisma.user.create({
    data: {
      name: 'Test Admin',
      email,
      passwordHash: await hashPassword(password),
      role: 'SUPER_ADMIN',
      active: true,
    },
  });
  const res = await request(app()).post(`${API}/auth/login`).send({ email, password }).expect(200);
  return { id: user.id, email, token: res.body.data.accessToken, refreshToken: res.body.data.refreshToken };
}

/** Registers a CUSTOMER through the public endpoint (exercising the real flow). */
export async function createCustomer(
  overrides: { email?: string; password?: string; name?: string } = {},
): Promise<Session> {
  const email = overrides.email ?? `cust-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const password = overrides.password ?? 'Customer@123';
  const res = await request(app())
    .post(`${API}/auth/register`)
    .send({ name: overrides.name ?? 'Test Customer', email, password })
    .expect(201);
  return {
    id: res.body.data.user.id,
    email,
    token: res.body.data.accessToken,
    refreshToken: res.body.data.refreshToken,
  };
}

export interface VariantFixture {
  categoryId: number;
  productId: number;
  variantId: number;
  sku: string;
}

/**
 * Creates the canonical fixture from the specification:
 * Oxford Classic Shirt / White / M, SKU OXF-W-M, cost 18, price 30, min stock 5.
 */
export async function createCatalogue(
  opts: {
    sku?: string;
    color?: string;
    size?: string;
    costPrice?: number;
    sellingPrice?: number;
    minimumStock?: number;
    stock?: number;
    productName?: string;
    categoryName?: string;
  } = {},
): Promise<VariantFixture> {
  const categoryName = opts.categoryName ?? `Cat-${Math.random().toString(36).slice(2, 8)}`;
  const category = await prisma.category.create({ data: { name: categoryName } });
  const productName = opts.productName ?? 'Oxford Classic Shirt';
  const product = await prisma.product.create({
    data: {
      categoryId: category.id,
      name: productName,
      brand: 'Rentoni',
      // Derived from the name so free-text search fixtures stay unambiguous.
      description: `${productName} — cotton, tailored fit`,
    },
  });
  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: opts.sku ?? 'OXF-W-M',
      barcode: `BC${Math.random().toString().slice(2, 12)}`,
      color: opts.color ?? 'White',
      size: opts.size ?? 'M',
      costPriceCents: toMinor(opts.costPrice ?? 18),
      sellingPriceCents: toMinor(opts.sellingPrice ?? 30),
      minimumStock: opts.minimumStock ?? 5,
      active: true,
    },
  });
  await InventoryService.ensureRecord(prisma, variant.id, 0);
  if (opts.stock && opts.stock > 0) {
    await InventoryService.applyChange(prisma, {
      variantId: variant.id,
      type: 'ADJUSTMENT_IN',
      quantity: opts.stock,
      referenceType: 'MANUAL',
      note: 'test fixture opening stock',
    });
  }
  return { categoryId: category.id, productId: product.id, variantId: variant.id, sku: variant.sku };
}

export async function stockOf(variantId: number): Promise<number> {
  const row = await prisma.inventory.findUnique({ where: { variantId } });
  return row?.quantity ?? 0;
}

/** Forces stock to an exact value without going through the adjustment audit path. */
export async function setStock(variantId: number, quantity: number) {
  await InventoryService.setAbsolute(prisma, { variantId, quantity, note: 'test setup' });
}

export async function createSupplier(name = 'Test Supplier') {
  return prisma.supplier.create({ data: { name, phone: '+15550000000' } });
}

export { request, prisma };

/**
 * Wipes the catalogue and everything that references it. Used by suites that assert on
 * absolute result counts, which would otherwise see rows created by earlier tests in
 * the same file (each test file shares one SQLite database).
 */
export async function resetCatalogue() {
  await prisma.$transaction([
    prisma.inventoryTransaction.deleteMany(),
    prisma.return.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.purchaseItem.deleteMany(),
    prisma.purchase.deleteMany(),
    prisma.cartItem.deleteMany(),
    prisma.inventory.deleteMany(),
    prisma.productVariant.deleteMany(),
    prisma.productImage.deleteMany(),
    prisma.product.deleteMany(),
    prisma.category.deleteMany(),
  ]);
}
