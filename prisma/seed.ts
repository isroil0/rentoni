/**
 * Development seed.
 *
 * Creates one SUPER_ADMIN, a few test CUSTOMERs, the shirt catalogue with its full
 * colour/size variant matrix, suppliers, and realistic opening stock that arrives
 * through *received purchases* — so the seeded stock has a proper inventory-transaction
 * history rather than being written directly.
 *
 * Safe to re-run: it truncates the transactional tables first. Never run against
 * production data.
 */
import { prisma } from '../src/db/prisma';
import { env } from '../src/config/env';
import { hashPassword } from '../src/utils/password';
import { InventoryService } from '../src/services/inventory.service';
import { PurchaseService } from '../src/services/purchase.service';
import { PosService } from '../src/services/pos.service';
import { CustomerOrderService } from '../src/services/customerOrder.service';
import { SETTING_KEYS } from '../src/config/constants';
import { toMinor } from '../src/utils/money';

const SIZES = ['S', 'M', 'L', 'XL'] as const;

interface ProductSpec {
  name: string;
  description: string;
  brand: string;
  category: string;
  skuPrefix: string;
  costPrice: number;
  sellingPrice: number;
  minimumStock: number;
  colors: { name: string; code: string; sizes: readonly string[] }[];
  images: { url: string; altText: string }[];
}

const CATEGORIES = [
  { name: 'Formal Shirts', description: 'Business and formal occasion shirts' },
  { name: 'Casual Shirts', description: 'Everyday casual and weekend shirts' },
  { name: 'Premium Shirts', description: 'Premium fabrics and tailored fits' },
];

const PRODUCTS: ProductSpec[] = [
  {
    name: 'Oxford Classic Shirt',
    description: 'Timeless button-down Oxford in breathable cotton. A wardrobe staple.',
    brand: 'Rentoni',
    category: 'Formal Shirts',
    skuPrefix: 'OXF',
    costPrice: 18,
    sellingPrice: 30,
    minimumStock: 5,
    colors: [
      { name: 'White', code: 'W', sizes: SIZES },
      { name: 'Black', code: 'B', sizes: SIZES },
      { name: 'Blue', code: 'BL', sizes: ['M', 'L', 'XL'] },
    ],
    images: [
      { url: 'https://cdn.rentoni.test/products/oxford-classic-white.jpg', altText: 'Oxford Classic Shirt in white' },
      { url: 'https://cdn.rentoni.test/products/oxford-classic-detail.jpg', altText: 'Oxford Classic Shirt collar detail' },
    ],
  },
  {
    name: 'Premium Formal Shirt',
    description: 'Two-ply Egyptian cotton with a cutaway collar and French cuffs.',
    brand: 'Rentoni Signature',
    category: 'Premium Shirts',
    skuPrefix: 'PRM',
    costPrice: 32,
    sellingPrice: 65,
    minimumStock: 4,
    colors: [
      { name: 'White', code: 'W', sizes: SIZES },
      { name: 'Black', code: 'B', sizes: SIZES },
      { name: 'Blue', code: 'BL', sizes: ['M', 'L', 'XL'] },
    ],
    images: [
      { url: 'https://cdn.rentoni.test/products/premium-formal.jpg', altText: 'Premium Formal Shirt' },
    ],
  },
  {
    name: 'Slim Fit Cotton Shirt',
    description: 'Tapered slim fit in soft combed cotton with a hidden button-down collar.',
    brand: 'Rentoni',
    category: 'Casual Shirts',
    skuPrefix: 'SLM',
    costPrice: 15,
    sellingPrice: 28,
    minimumStock: 6,
    colors: [
      { name: 'White', code: 'W', sizes: SIZES },
      { name: 'Black', code: 'B', sizes: SIZES },
      { name: 'Blue', code: 'BL', sizes: ['M', 'L', 'XL'] },
    ],
    images: [
      { url: 'https://cdn.rentoni.test/products/slim-fit-cotton.jpg', altText: 'Slim Fit Cotton Shirt' },
    ],
  },
  {
    name: 'Business White Shirt',
    description: 'Wrinkle-resistant white shirt built for long days at the office.',
    brand: 'Rentoni Work',
    category: 'Formal Shirts',
    skuPrefix: 'BUS',
    costPrice: 20,
    sellingPrice: 38,
    minimumStock: 5,
    colors: [
      { name: 'White', code: 'W', sizes: SIZES },
      { name: 'Blue', code: 'BL', sizes: ['M', 'L', 'XL'] },
    ],
    images: [
      { url: 'https://cdn.rentoni.test/products/business-white.jpg', altText: 'Business White Shirt' },
    ],
  },
  {
    name: 'Casual Linen Shirt',
    description: 'Lightweight breathable linen with a relaxed fit — made for warm days.',
    brand: 'Rentoni',
    category: 'Casual Shirts',
    skuPrefix: 'LIN',
    costPrice: 22,
    sellingPrice: 42,
    minimumStock: 4,
    colors: [
      { name: 'White', code: 'W', sizes: SIZES },
      { name: 'Black', code: 'B', sizes: SIZES },
      { name: 'Blue', code: 'BL', sizes: ['M', 'L', 'XL'] },
    ],
    images: [
      { url: 'https://cdn.rentoni.test/products/casual-linen.jpg', altText: 'Casual Linen Shirt' },
    ],
  },
];

/** Opening stock per size — larger sizes in the middle of the range sell most. */
const OPENING_STOCK: Record<string, number> = { S: 12, M: 20, L: 18, XL: 10 };

async function clearDatabase() {
  // Order matters: children before parents.
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.inventoryTransaction.deleteMany(),
    prisma.return.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.purchaseItem.deleteMany(),
    prisma.purchase.deleteMany(),
    prisma.cartItem.deleteMany(),
    prisma.cart.deleteMany(),
    prisma.inventory.deleteMany(),
    prisma.productVariant.deleteMany(),
    prisma.productImage.deleteMany(),
    prisma.product.deleteMany(),
    prisma.category.deleteMany(),
    prisma.supplier.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
    prisma.setting.deleteMany(),
    prisma.numberSequence.deleteMany(),
  ]);
}

async function main() {
  console.log('Seeding database…');
  await clearDatabase();

  // ---- users --------------------------------------------------------------
  const admin = await prisma.user.create({
    data: {
      name: env.superAdminName,
      email: env.superAdminEmail.toLowerCase(),
      phone: '+15550100001',
      passwordHash: await hashPassword(env.superAdminPassword),
      role: 'SUPER_ADMIN',
      active: true,
    },
  });
  console.log(`  SUPER_ADMIN: ${admin.email} / ${env.superAdminPassword}`);

  const customerPassword = 'Customer@123';
  const customers = [];
  for (const spec of [
    { name: 'Test Customer One', email: 'customer1@rentoni.test', phone: '+15550200001' },
    { name: 'Test Customer Two', email: 'customer2@rentoni.test', phone: '+15550200002' },
    { name: 'Inactive Customer', email: 'inactive@rentoni.test', phone: '+15550200003', active: false },
  ]) {
    customers.push(
      await prisma.user.create({
        data: {
          name: spec.name,
          email: spec.email,
          phone: spec.phone,
          passwordHash: await hashPassword(customerPassword),
          role: 'CUSTOMER',
          active: spec.active ?? true,
        },
      }),
    );
  }
  console.log(`  ${customers.length} CUSTOMER accounts (password: ${customerPassword})`);

  // ---- settings -----------------------------------------------------------
  await prisma.setting.createMany({
    data: [
      { key: SETTING_KEYS.STORE_NAME, value: 'Rentoni Shirts' },
      { key: SETTING_KEYS.CURRENCY, value: 'USD' },
      // Customers see IN_STOCK / LOW_STOCK / OUT_OF_STOCK, not exact numbers.
      { key: SETTING_KEYS.EXPOSE_EXACT_STOCK, value: 'false' },
      { key: SETTING_KEYS.CUSTOMER_CANCEL_WINDOW_HOURS, value: '24' },
      { key: SETTING_KEYS.CUSTOMER_RETURN_WINDOW_DAYS, value: '14' },
    ],
  });

  // ---- suppliers ----------------------------------------------------------
  const suppliers = await Promise.all(
    [
      { name: 'Atlas Textile Co.', phone: '+15550300001', address: '14 Mill Road, Industrial Park' },
      { name: 'Northline Garments', phone: '+15550300002', address: '88 Harbour Way, Dock District' },
      { name: 'Verda Linen Supply', phone: '+15550300003', address: '5 Orchard Lane' },
    ].map((s) => prisma.supplier.create({ data: s })),
  );

  // ---- categories ---------------------------------------------------------
  const categoryMap = new Map<string, number>();
  for (const c of CATEGORIES) {
    const row = await prisma.category.create({ data: c });
    categoryMap.set(row.name, row.id);
  }

  // ---- products, variants, images -----------------------------------------
  let variantCount = 0;
  const purchaseLines: { variantId: number; quantity: number; unitCost: number }[] = [];

  for (const spec of PRODUCTS) {
    const categoryId = categoryMap.get(spec.category)!;
    const product = await prisma.product.create({
      data: {
        categoryId,
        name: spec.name,
        description: spec.description,
        brand: spec.brand,
        active: true,
        images: {
          create: spec.images.map((img, i) => ({
            url: img.url,
            altText: img.altText,
            sortOrder: i,
            isPrimary: i === 0,
          })),
        },
      },
    });

    for (const color of spec.colors) {
      for (const size of color.sizes) {
        const sku = `${spec.skuPrefix}-${color.code}-${size}`;
        const variant = await prisma.productVariant.create({
          data: {
            productId: product.id,
            sku,
            barcode: `20${String(variantCount + 1).padStart(11, '0')}`,
            color: color.name,
            size,
            costPriceCents: toMinor(spec.costPrice),
            sellingPriceCents: toMinor(spec.sellingPrice),
            minimumStock: spec.minimumStock,
            active: true,
          },
        });
        // Every variant gets its inventory row immediately, starting at zero.
        await InventoryService.ensureRecord(prisma, variant.id, 0);
        variantCount += 1;

        purchaseLines.push({
          variantId: variant.id,
          quantity: OPENING_STOCK[size] ?? 10,
          unitCost: spec.costPrice,
        });
      }
    }
  }
  console.log(`  ${PRODUCTS.length} products / ${variantCount} variants`);

  // ---- opening stock via received purchases -------------------------------
  const actor = { userId: admin.id, ip: null };
  const chunkSize = Math.ceil(purchaseLines.length / suppliers.length);
  let received = 0;

  for (let i = 0; i < suppliers.length; i += 1) {
    const chunk = purchaseLines.slice(i * chunkSize, (i + 1) * chunkSize);
    if (!chunk.length) continue;
    const purchase = await PurchaseService.create(
      {
        supplierId: suppliers[i]!.id,
        items: chunk,
        note: 'Opening stock',
        receiveNow: true,
      },
      actor,
    );
    received += purchase.itemCount;
  }
  console.log(`  ${received} units received through ${suppliers.length} purchases`);

  // ---- a little trading history -------------------------------------------
  const oxfordWhiteM = await prisma.productVariant.findUniqueOrThrow({ where: { sku: 'OXF-W-M' } });
  const slimBlackL = await prisma.productVariant.findUniqueOrThrow({ where: { sku: 'SLM-B-L' } });
  const linenWhiteL = await prisma.productVariant.findUniqueOrThrow({ where: { sku: 'LIN-W-L' } });

  await PosService.createOrder(
    {
      lines: [
        { variantId: oxfordWhiteM.id, quantity: 2 },
        { variantId: slimBlackL.id, quantity: 1 },
      ],
      paymentMethod: 'CASH',
      customerName: 'Walk-in',
      completeNow: true,
    },
    actor,
  );

  await CustomerOrderService.create(customers[0]!.id, {
    lines: [{ variantId: linenWhiteL.id, quantity: 1 }],
    paymentMethod: 'CARD',
    note: 'Seeded online order',
  });

  // A deliberately low-stock and an out-of-stock variant, for dashboard realism.
  const premiumBlackS = await prisma.productVariant.findUniqueOrThrow({ where: { sku: 'PRM-B-S' } });
  const businessBlueXl = await prisma.productVariant.findUniqueOrThrow({ where: { sku: 'BUS-BL-XL' } });
  await InventoryService.adjust({
    variantId: premiumBlackS.id,
    type: 'ADJUSTMENT_OUT',
    setQuantity: 3,
    note: 'Seed: low stock example',
    userId: admin.id,
  });
  await InventoryService.adjust({
    variantId: businessBlueXl.id,
    type: 'ADJUSTMENT_OUT',
    setQuantity: 0,
    note: 'Seed: out of stock example',
    userId: admin.id,
  });

  const totals = await prisma.inventory.aggregate({ _sum: { quantity: true } });
  const txCount = await prisma.inventoryTransaction.count();
  console.log(`  total stock on hand: ${totals._sum.quantity} units across ${txCount} inventory transactions`);
  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
