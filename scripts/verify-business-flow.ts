/**
 * Runs the specification's end-to-end business scenario against a throwaway database
 * and prints a step-by-step report. Complements the automated suite by exercising the
 * real HTTP stack end to end in one readable pass.
 *
 *   npm run verify:flow
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '..');
const TMP = path.join(ROOT, '.tmp');
const DB = path.join(TMP, `verify-${crypto.randomUUID()}.db`);

fs.mkdirSync(TMP, { recursive: true });
execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: ROOT,
  env: { ...process.env, DATABASE_URL: `file:${DB}` },
  stdio: 'pipe',
});

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `file:${DB}`;
process.env.ADMIN_SETUP_TOKEN = 'verify-setup-token';

/* eslint-disable @typescript-eslint/no-var-requires */
const request = require('supertest');
const { createApp } = require('../src/app');
const { prisma } = require('../src/db/prisma');
const { hashPassword } = require('../src/utils/password');

const app = createApp();
const API = '/api';

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed += 1;
    console.log(`     ✓ ${label}: ${JSON.stringify(actual)}`);
  } else {
    failed += 1;
    console.log(`     ✗ ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const step = (n: string, title: string) => console.log(`\n${n}. ${title}`);

async function stockOf(variantId: number): Promise<number> {
  const row = await prisma.inventory.findUnique({ where: { variantId } });
  return row?.quantity ?? 0;
}

async function main() {
  console.log('CRITICAL BUSINESS FLOW VERIFICATION');
  console.log('===================================');

  // --- actors ---------------------------------------------------------------
  const admin = await prisma.user.create({
    data: {
      name: 'Store Owner',
      email: 'verify-admin@rentoni.test',
      passwordHash: await hashPassword('Admin@12345'),
      role: 'SUPER_ADMIN',
    },
  });
  const adminLogin = await request(app)
    .post(`${API}/auth/login`)
    .send({ email: 'verify-admin@rentoni.test', password: 'Admin@12345' });
  const A = { Authorization: `Bearer ${adminLogin.body.data.accessToken}` };

  const customerReg = await request(app)
    .post(`${API}/auth/register`)
    .send({ name: 'Verify Customer', email: 'verify-cust@rentoni.test', password: 'Customer@123' });
  const C = { Authorization: `Bearer ${customerReg.body.data.accessToken}` };

  step('0', 'Set up Oxford Classic Shirt / White / M (SKU OXF-W-M, cost $18, price $30, min 5)');
  const category = await request(app)
    .post(`${API}/admin/categories`)
    .set(A)
    .send({ name: 'Formal Shirts' });
  const product = await request(app)
    .post(`${API}/admin/products`)
    .set(A)
    .send({
      categoryId: category.body.data.id,
      name: 'Oxford Classic Shirt',
      brand: 'Rentoni',
      variants: [
        { sku: 'OXF-W-M', color: 'White', size: 'M', costPrice: 18, sellingPrice: 30, minimumStock: 5 },
      ],
    });
  const productId = product.body.data.id;
  const variantId = product.body.data.variants[0].id;
  check('sku', product.body.data.variants[0].sku, 'OXF-W-M');
  check('opening stock', await stockOf(variantId), 0);

  step('1', 'Receive a purchase of 20 units');
  const supplier = await request(app).post(`${API}/admin/suppliers`).set(A).send({ name: 'Atlas Textile Co.' });
  const purchase = await request(app)
    .post(`${API}/admin/purchases`)
    .set(A)
    .send({ supplierId: supplier.body.data.id, items: [{ variantId, quantity: 20, unitCost: 18 }] });
  await request(app).post(`${API}/admin/purchases/${purchase.body.data.id}/receive`).set(A);
  check('stock after purchase', await stockOf(variantId), 20);
  check(
    'PURCHASE transaction',
    (await prisma.inventoryTransaction.count({ where: { variantId, type: 'PURCHASE' } })) === 1,
    true,
  );

  step('2', 'SUPER_ADMIN sells 3 through POS');
  const posSale = await request(app)
    .post(`${API}/admin/pos/orders`)
    .set(A)
    .send({ items: [{ variantId, quantity: 3 }], paymentMethod: 'CASH', completeNow: true });
  check('POS order total', posSale.body.data.total, 90);
  check('stock 20 -> 17', await stockOf(variantId), 17);
  const saleTx = await prisma.inventoryTransaction.findFirst({
    where: { variantId, type: 'SALE', referenceId: posSale.body.data.id },
  });
  check('SALE transaction 20 -> 17', [saleTx?.previousQuantity, saleTx?.quantity, saleTx?.newQuantity], [20, -3, 17]);

  step('3', 'Customer buys 2 online');
  const onlineOrder = await request(app)
    .post(`${API}/customer/orders`)
    .set(C)
    .send({ items: [{ variantId, quantity: 2 }] });
  check('online order total', onlineOrder.body.data.total, 60);
  check('stock 17 -> 15', await stockOf(variantId), 15);

  step('4', 'Customer website shows availability');
  const storefront = await request(app).get(`${API}/products/${productId}`);
  check('availability', storefront.body.data.variants[0].availability, 'IN_STOCK');
  check('cost price hidden', JSON.stringify(storefront.body).includes('costPrice'), false);

  step('5', 'Try to sell 16 (must fail)');
  const oversell = await request(app)
    .post(`${API}/admin/pos/orders`)
    .set(A)
    .send({ items: [{ variantId, quantity: 16 }], completeNow: true });
  check('status', oversell.status, 409);
  check('error code', oversell.body.error.code, 'INSUFFICIENT_STOCK');
  check('stock unchanged', await stockOf(variantId), 15);

  step('6', 'Return 1 unit');
  await request(app).post(`${API}/admin/orders/${onlineOrder.body.data.id}/status`).set(A).send({ status: 'COMPLETED' });
  const ret = await request(app)
    .post(`${API}/admin/returns`)
    .set(A)
    .send({ orderId: onlineOrder.body.data.id, items: [{ variantId, quantity: 1 }], reason: 'Wrong size' });
  check('return accepted', ret.body.data[0].status, 'ACCEPTED');
  check('stock 15 -> 16', await stockOf(variantId), 16);
  const retTx = await prisma.inventoryTransaction.findFirst({
    where: { variantId, type: 'RETURN', referenceId: ret.body.data[0].id },
  });
  check('RETURN transaction 15 -> 16', [retTx?.previousQuantity, retTx?.quantity, retTx?.newQuantity], [15, 1, 16]);

  step('7', 'Change the price from $30 to $35');
  await request(app).put(`${API}/admin/variants/${variantId}`).set(A).send({ sellingPrice: 35 });
  const historical = await request(app).get(`${API}/customer/orders/${onlineOrder.body.data.id}`).set(C);
  check('old order still $30/unit', historical.body.data.items[0].unitPrice, 30);
  check('old order total still $60', historical.body.data.total, 60);
  const nowPriced = await request(app).get(`${API}/products/${productId}`);
  check('storefront now $35', nowPriced.body.data.variants[0].price, 35);

  step('8', 'Set stock to 5 (minimum stock is 5)');
  await request(app).post(`${API}/admin/inventory/adjust`).set(A).send({ variantId, setQuantity: 5 });
  const low = await request(app).get(`${API}/admin/inventory/${variantId}`).set(A);
  check('status', low.body.data.status, 'LOW_STOCK');

  step('9', 'Set stock to 0');
  await request(app).post(`${API}/admin/inventory/adjust`).set(A).send({ variantId, setQuantity: 0 });
  const out = await request(app).get(`${API}/admin/inventory/${variantId}`).set(A);
  check('status', out.body.data.status, 'OUT_OF_STOCK');
  const soldOut = await request(app).get(`${API}/products/${productId}`);
  check('storefront availability', soldOut.body.data.variants[0].availability, 'OUT_OF_STOCK');

  step('10', 'Set stock to 1, then send two simultaneous purchase requests');
  await request(app).post(`${API}/admin/inventory/adjust`).set(A).send({ variantId, setQuantity: 1 });

  const buyerA = await request(app)
    .post(`${API}/auth/register`)
    .send({ name: 'Buyer A', email: 'buyer-a@rentoni.test', password: 'Customer@123' });
  const buyerB = await request(app)
    .post(`${API}/auth/register`)
    .send({ name: 'Buyer B', email: 'buyer-b@rentoni.test', password: 'Customer@123' });

  const [r1, r2] = await Promise.all([
    request(app)
      .post(`${API}/customer/orders`)
      .set({ Authorization: `Bearer ${buyerA.body.data.accessToken}` })
      .send({ items: [{ variantId, quantity: 1 }] }),
    request(app)
      .post(`${API}/customer/orders`)
      .set({ Authorization: `Bearer ${buyerB.body.data.accessToken}` })
      .send({ items: [{ variantId, quantity: 1 }] }),
  ]);

  check('one succeeded, one failed', [r1.status, r2.status].sort((a, b) => a - b), [201, 409]);
  check('failure reason', [r1, r2].find((r) => r.status === 409)!.body.error.code, 'INSUFFICIENT_STOCK');
  const finalStock = await stockOf(variantId);
  check('final stock', finalStock, 0);
  check('stock is never negative', finalStock >= 0, true);

  step('✓', 'Ledger and audit trail consistency');
  const txns = await prisma.inventoryTransaction.findMany({ where: { variantId }, orderBy: { id: 'asc' } });
  check('signed movements sum to current stock', txns.reduce((s: number, t: { quantity: number }) => s + t.quantity, 0), finalStock);
  const chained = txns.every(
    (t: { previousQuantity: number; quantity: number; newQuantity: number }, i: number) =>
      t.newQuantity === t.previousQuantity + t.quantity &&
      (i === 0 || t.previousQuantity === txns[i - 1].newQuantity),
  );
  check('every transaction chains correctly', chained, true);
  const auditActions = new Set(
    (await prisma.auditLog.findMany({ select: { action: true } })).map((a: { action: string }) => a.action),
  );
  check(
    'audit covers the flow',
    ['PURCHASE_RECEIVED', 'ORDER_COMPLETED', 'RETURN_ACCEPTED', 'PRICE_CHANGED', 'INVENTORY_ADJUSTED'].every(
      (a) => auditActions.has(a),
    ),
    true,
  );

  console.log(`\n===================================`);
  console.log(`${passed} checks passed, ${failed} failed`);

  await prisma.$disconnect();
  for (const suffix of ['', '-journal', '-wal', '-shm']) fs.rmSync(`${DB}${suffix}`, { force: true });
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('\nVerification failed:', err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
