import { prisma, Prisma } from '../db/prisma';
import { runInTransaction } from '../db/transaction';
import { AppError } from '../errors/AppError';
import { AuditService, AUDIT_ACTIONS } from './audit.service';
import { InventoryService } from './inventory.service';
import { SettingsService } from './settings.service';
import { adminProduct, customerProduct } from '../serializers/product.serializer';
import { toMinor } from '../utils/money';
import type { Actor } from './category.service';

const FULL_INCLUDE = {
  category: { select: { id: true, name: true, active: true } },
  images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
  variants: { include: { inventory: true }, orderBy: { id: 'asc' } },
} satisfies Prisma.ProductInclude;

export interface VariantInput {
  sku: string;
  barcode?: string | null;
  color: string;
  size: string;
  costPrice: number;
  sellingPrice: number;
  minimumStock?: number;
  active?: boolean;
  initialStock?: number;
}

export interface ProductSearchParams {
  skip: number;
  take: number;
  search?: string;
  categoryId?: number;
  brand?: string;
  color?: string;
  size?: string;
  sku?: string;
  barcode?: string;
  minPrice?: number;
  maxPrice?: number;
  availability?: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  active?: boolean;
  sort?: 'newest' | 'oldest' | 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc';
}

/**
 * Builds the shared product filter used by both the admin and the customer catalogue.
 * Variant-level filters (colour/size/sku/price) are expressed as a `some` clause so a
 * product matches when at least one of its variants does.
 */
function buildProductWhere(p: ProductSearchParams, publicOnly: boolean): Prisma.ProductWhereInput {
  const variantConditions: Prisma.ProductVariantWhereInput = {
    ...(publicOnly ? { active: true } : {}),
    ...(p.color ? { color: { equals: p.color } } : {}),
    ...(p.size ? { size: { equals: p.size } } : {}),
    ...(p.sku ? { sku: { contains: p.sku, mode: 'insensitive' as const } } : {}),
    ...(p.barcode ? { barcode: p.barcode } : {}),
    ...(p.minPrice !== undefined || p.maxPrice !== undefined
      ? {
          sellingPriceCents: {
            ...(p.minPrice !== undefined ? { gte: toMinor(p.minPrice) } : {}),
            ...(p.maxPrice !== undefined ? { lte: toMinor(p.maxPrice) } : {}),
          },
        }
      : {}),
  };

  const hasVariantFilter = Object.keys(variantConditions).length > 0;

  return {
    ...(publicOnly ? { active: true, category: { active: true } } : {}),
    ...(p.active !== undefined && !publicOnly ? { active: p.active } : {}),
    ...(p.categoryId ? { categoryId: p.categoryId } : {}),
    ...(p.brand ? { brand: { contains: p.brand, mode: 'insensitive' as const } } : {}),
    ...(p.search
      ? {
          OR: [
            { name: { contains: p.search, mode: 'insensitive' as const } },
            { description: { contains: p.search, mode: 'insensitive' as const } },
            { brand: { contains: p.search, mode: 'insensitive' as const } },
            { variants: { some: { sku: { contains: p.search, mode: 'insensitive' as const } } } },
            { variants: { some: { barcode: { contains: p.search, mode: 'insensitive' as const } } } },
          ],
        }
      : {}),
    ...(hasVariantFilter ? { variants: { some: variantConditions } } : {}),
  };
}

function orderBy(sort?: ProductSearchParams['sort']): Prisma.ProductOrderByWithRelationInput {
  switch (sort) {
    case 'oldest':
      return { createdAt: 'asc' };
    case 'name_asc':
      return { name: 'asc' };
    case 'name_desc':
      return { name: 'desc' };
    case 'newest':
      return { createdAt: 'desc' };
    default:
      return { id: 'asc' };
  }
}

/** Availability + price sorting depend on aggregated variant data, so they run in memory. */
function applyDerivedFilters<T extends { availability?: string; priceFrom?: number | null }>(
  rows: T[],
  params: ProductSearchParams,
): T[] {
  let out = rows;
  if (params.availability) out = out.filter((r) => r.availability === params.availability);
  if (params.sort === 'price_asc') {
    out = [...out].sort((a, b) => (a.priceFrom ?? Infinity) - (b.priceFrom ?? Infinity));
  }
  if (params.sort === 'price_desc') {
    out = [...out].sort((a, b) => (b.priceFrom ?? -Infinity) - (a.priceFrom ?? -Infinity));
  }
  return out;
}

export const ProductService = {
  async adminList(params: ProductSearchParams) {
    const where = buildProductWhere(params, false);
    const rows = await prisma.product.findMany({
      where,
      include: FULL_INCLUDE,
      orderBy: orderBy(params.sort),
    });
    const mapped = rows.map(adminProduct);
    const filtered = params.availability
      ? mapped.filter((m) => m.variants.some((v) => v.stockStatus === params.availability))
      : mapped;
    const sorted =
      params.sort === 'price_asc' || params.sort === 'price_desc'
        ? [...filtered].sort((a, b) => {
            const pa = Math.min(...(a.variants.length ? a.variants.map((v) => v.sellingPrice) : [Infinity]));
            const pb = Math.min(...(b.variants.length ? b.variants.map((v) => v.sellingPrice) : [Infinity]));
            return params.sort === 'price_asc' ? pa - pb : pb - pa;
          })
        : filtered;
    return { items: sorted.slice(params.skip, params.skip + params.take), total: sorted.length };
  },

  async adminGetById(id: number) {
    const product = await prisma.product.findUnique({ where: { id }, include: FULL_INCLUDE });
    if (!product) throw new AppError('PRODUCT_NOT_FOUND');
    return adminProduct(product);
  },

  /** Customer catalogue: only active products in active categories, cost prices stripped. */
  async publicList(params: ProductSearchParams) {
    const exposeExactStock = await SettingsService.exposeExactStock();
    const where = buildProductWhere(params, true);
    const rows = await prisma.product.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, active: true } },
        images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
        variants: { where: { active: true }, include: { inventory: true }, orderBy: { id: 'asc' } },
      },
      orderBy: orderBy(params.sort),
    });
    const mapped = rows.map((p) => customerProduct(p, { exposeExactStock }));
    const filtered = applyDerivedFilters(mapped, params);
    return { items: filtered.slice(params.skip, params.skip + params.take), total: filtered.length };
  },

  async publicGetById(id: number) {
    const exposeExactStock = await SettingsService.exposeExactStock();
    const product = await prisma.product.findFirst({
      where: { id, active: true, category: { active: true } },
      include: {
        category: { select: { id: true, name: true, active: true } },
        images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
        variants: { where: { active: true }, include: { inventory: true }, orderBy: { id: 'asc' } },
      },
    });
    if (!product) throw new AppError('PRODUCT_NOT_FOUND');
    return customerProduct(product, { exposeExactStock });
  },

  /**
   * Creates a product and, optionally, its whole variant matrix in one transaction —
   * including the inventory row and an opening-stock transaction for each variant.
   */
  async create(
    input: {
      categoryId: number;
      name: string;
      description?: string | null;
      brand?: string | null;
      active?: boolean;
      images?: { url: string; altText?: string | null; sortOrder?: number; isPrimary?: boolean }[];
      variants?: VariantInput[];
    },
    actor: Actor,
  ) {
    const product = await runInTransaction(async (tx) => {
      const category = await tx.category.findUnique({ where: { id: input.categoryId } });
      if (!category) throw new AppError('CATEGORY_NOT_FOUND');

      const createdProduct = await tx.product.create({
        data: {
          categoryId: input.categoryId,
          name: input.name,
          description: input.description ?? null,
          brand: input.brand ?? null,
          active: input.active ?? true,
        },
      });

      if (input.images?.length) {
        await tx.productImage.createMany({
          data: normaliseImages(input.images, createdProduct.id),
        });
      }

      for (const variant of input.variants ?? []) {
        await createVariantInTx(tx, createdProduct.id, variant, actor);
      }

      return tx.product.findUniqueOrThrow({ where: { id: createdProduct.id }, include: FULL_INCLUDE });
    });

    await AuditService.record({
      userId: actor.userId,
      action: AUDIT_ACTIONS.PRODUCT_CREATED,
      entityType: 'Product',
      entityId: product.id,
      newValue: { name: product.name, categoryId: product.categoryId, brand: product.brand },
      ip: actor.ip,
    });

    return adminProduct(product);
  },

  async update(
    id: number,
    input: {
      categoryId?: number;
      name?: string;
      description?: string | null;
      brand?: string | null;
      active?: boolean;
    },
    actor: Actor,
  ) {
    const before = await prisma.product.findUnique({ where: { id } });
    if (!before) throw new AppError('PRODUCT_NOT_FOUND');

    if (input.categoryId && input.categoryId !== before.categoryId) {
      const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
      if (!category) throw new AppError('CATEGORY_NOT_FOUND');
    }

    await prisma.product.update({ where: { id }, data: input });
    const after = await prisma.product.findUniqueOrThrow({ where: { id }, include: FULL_INCLUDE });

    await AuditService.record({
      userId: actor.userId,
      action: AUDIT_ACTIONS.PRODUCT_UPDATED,
      entityType: 'Product',
      entityId: id,
      oldValue: {
        name: before.name,
        description: before.description,
        brand: before.brand,
        categoryId: before.categoryId,
        active: before.active,
      },
      newValue: input,
      ip: actor.ip,
    });

    return adminProduct(after);
  },

  /**
   * Soft delete (deactivate product + variants) by default. A hard delete is only
   * permitted when the product was never sold or purchased, to keep order history intact.
   */
  async remove(id: number, actor: Actor, hard = false) {
    const before = await prisma.product.findUnique({
      where: { id },
      include: { variants: { select: { id: true } } },
    });
    if (!before) throw new AppError('PRODUCT_NOT_FOUND');

    await runInTransaction(async (tx) => {
      if (hard) {
        const variantIds = before.variants.map((v) => v.id);
        const [orderUses, purchaseUses] = await Promise.all([
          tx.orderItem.count({ where: { variantId: { in: variantIds } } }),
          tx.purchaseItem.count({ where: { variantId: { in: variantIds } } }),
        ]);
        if (orderUses > 0 || purchaseUses > 0) {
          throw new AppError(
            'CONFLICT',
            'Product has order or purchase history and cannot be hard-deleted; deactivate it instead.',
          );
        }
        await tx.product.delete({ where: { id } });
      } else {
        await tx.product.update({ where: { id }, data: { active: false } });
        await tx.productVariant.updateMany({ where: { productId: id }, data: { active: false } });
      }
    });

    await AuditService.record({
      userId: actor.userId,
      action: AUDIT_ACTIONS.PRODUCT_DELETED,
      entityType: 'Product',
      entityId: id,
      oldValue: { name: before.name, active: before.active },
      newValue: { deleted: hard, active: false },
      ip: actor.ip,
    });

    return { id, deleted: hard, deactivated: !hard };
  },

  // ---- images -------------------------------------------------------------

  async addImages(
    productId: number,
    images: { url: string; altText?: string | null; sortOrder?: number; isPrimary?: boolean }[],
    actor: Actor,
  ) {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new AppError('PRODUCT_NOT_FOUND');

    const created = await runInTransaction(async (tx) => {
      const rows = normaliseImages(images, productId);
      if (rows.some((r) => r.isPrimary)) {
        await tx.productImage.updateMany({ where: { productId }, data: { isPrimary: false } });
      }
      await tx.productImage.createMany({ data: rows });
      return tx.productImage.findMany({
        where: { productId },
        orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
      });
    });

    await AuditService.record({
      userId: actor.userId,
      action: AUDIT_ACTIONS.IMAGE_ADDED,
      entityType: 'Product',
      entityId: productId,
      newValue: { count: images.length },
      ip: actor.ip,
    });
    return created;
  },

  async removeImage(productId: number, imageId: number, actor: Actor) {
    const image = await prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!image) throw new AppError('IMAGE_NOT_FOUND');
    await prisma.productImage.delete({ where: { id: imageId } });
    await AuditService.record({
      userId: actor.userId,
      action: AUDIT_ACTIONS.IMAGE_DELETED,
      entityType: 'Product',
      entityId: productId,
      oldValue: { imageId, url: image.url },
      ip: actor.ip,
    });
    return { id: imageId, deleted: true };
  },

  async setPrimaryImage(productId: number, imageId: number) {
    const image = await prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!image) throw new AppError('IMAGE_NOT_FOUND');
    return runInTransaction(async (tx) => {
      await tx.productImage.updateMany({ where: { productId }, data: { isPrimary: false } });
      return tx.productImage.update({ where: { id: imageId }, data: { isPrimary: true } });
    });
  },
};

function normaliseImages(
  images: { url: string; altText?: string | null; sortOrder?: number; isPrimary?: boolean }[],
  productId: number,
) {
  // At most one primary image; if none is flagged the first one wins.
  let primaryTaken = false;
  return images.map((img, index) => {
    const isPrimary = (img.isPrimary ?? (index === 0 && images.length > 0)) && !primaryTaken;
    if (isPrimary) primaryTaken = true;
    return {
      productId,
      url: img.url,
      altText: img.altText ?? null,
      sortOrder: img.sortOrder ?? index,
      isPrimary,
    };
  });
}

/** Shared by ProductService.create and VariantService.create. */
export async function createVariantInTx(
  tx: Prisma.TransactionClient,
  productId: number,
  input: VariantInput,
  actor: Actor,
) {
  const sku = input.sku.trim().toUpperCase();
  const barcode = input.barcode?.trim() || null;

  const [skuClash, barcodeClash, comboClash] = await Promise.all([
    tx.productVariant.findUnique({ where: { sku } }),
    barcode ? tx.productVariant.findUnique({ where: { barcode } }) : Promise.resolve(null),
    tx.productVariant.findUnique({
      where: { productId_color_size: { productId, color: input.color, size: input.size } },
    }),
  ]);
  if (skuClash) throw new AppError('DUPLICATE_SKU', { sku });
  if (barcodeClash) throw new AppError('DUPLICATE_BARCODE', { barcode });
  if (comboClash) throw new AppError('DUPLICATE_VARIANT', { color: input.color, size: input.size });

  const variant = await tx.productVariant.create({
    data: {
      productId,
      sku,
      barcode,
      color: input.color,
      size: input.size,
      costPriceCents: toMinor(input.costPrice),
      sellingPriceCents: toMinor(input.sellingPrice),
      minimumStock: input.minimumStock ?? 0,
      active: input.active ?? true,
    },
  });

  // Every variant gets exactly one inventory row, created up front.
  await InventoryService.ensureRecord(tx, variant.id, 0);

  if (input.initialStock && input.initialStock > 0) {
    await InventoryService.applyChange(tx, {
      variantId: variant.id,
      type: 'ADJUSTMENT_IN',
      quantity: input.initialStock,
      referenceType: 'MANUAL',
      userId: actor.userId,
      note: 'Opening stock',
    });
  }

  return variant;
}
