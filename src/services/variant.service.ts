import { prisma } from '../db/prisma';
import { runInTransaction } from '../db/transaction';
import { AppError } from '../errors/AppError';
import { AuditService, AUDIT_ACTIONS } from './audit.service';
import { adminVariant } from '../serializers/product.serializer';
import { toMajor, toMinor } from '../utils/money';
import { createVariantInTx, type VariantInput } from './product.service';
import type { Actor } from './category.service';

export const VariantService = {
  async list(params: {
    skip: number;
    take: number;
    productId?: number;
    search?: string;
    color?: string;
    size?: string;
    active?: boolean;
  }) {
    const where = {
      ...(params.productId ? { productId: params.productId } : {}),
      ...(params.color ? { color: params.color } : {}),
      ...(params.size ? { size: params.size } : {}),
      ...(params.active !== undefined ? { active: params.active } : {}),
      ...(params.search
        ? {
            OR: [
              { sku: { contains: params.search } },
              { barcode: { contains: params.search } },
              { product: { name: { contains: params.search } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.productVariant.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { id: 'asc' },
        include: { inventory: true, product: { select: { id: true, name: true, brand: true } } },
      }),
      prisma.productVariant.count({ where }),
    ]);
    return {
      items: rows.map((v) => ({ ...adminVariant(v), product: v.product })),
      total,
    };
  },

  async getById(id: number) {
    const variant = await prisma.productVariant.findUnique({
      where: { id },
      include: { inventory: true, product: { select: { id: true, name: true, brand: true } } },
    });
    if (!variant) throw new AppError('VARIANT_NOT_FOUND');
    return { ...adminVariant(variant), product: variant.product };
  },

  /** Lookup used by the POS scanner: exact SKU or barcode match. */
  async findByCode(code: string) {
    const needle = code.trim();
    const variant = await prisma.productVariant.findFirst({
      where: { OR: [{ sku: needle.toUpperCase() }, { barcode: needle }] },
      include: { inventory: true, product: { select: { id: true, name: true, brand: true } } },
    });
    if (!variant) throw new AppError('VARIANT_NOT_FOUND');
    return { ...adminVariant(variant), product: variant.product };
  },

  async create(productId: number, input: VariantInput, actor: Actor) {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new AppError('PRODUCT_NOT_FOUND');

    const variant = await runInTransaction((tx) => createVariantInTx(tx, productId, input, actor));

    await AuditService.record({
      userId: actor.userId,
      action: AUDIT_ACTIONS.VARIANT_CREATED,
      entityType: 'ProductVariant',
      entityId: variant.id,
      newValue: {
        sku: variant.sku,
        color: variant.color,
        size: variant.size,
        sellingPrice: toMajor(variant.sellingPriceCents),
        costPrice: toMajor(variant.costPriceCents),
      },
      ip: actor.ip,
    });

    return this.getById(variant.id);
  },

  /**
   * Updates a variant. Price changes are audited separately under PRICE_CHANGED, and
   * they never affect historical order items — those carry their own price snapshot.
   */
  async update(
    id: number,
    input: {
      sku?: string;
      barcode?: string | null;
      color?: string;
      size?: string;
      costPrice?: number;
      sellingPrice?: number;
      minimumStock?: number;
      active?: boolean;
    },
    actor: Actor,
  ) {
    const before = await prisma.productVariant.findUnique({ where: { id } });
    if (!before) throw new AppError('VARIANT_NOT_FOUND');

    const sku = input.sku ? input.sku.trim().toUpperCase() : undefined;
    const barcode = input.barcode === undefined ? undefined : input.barcode?.trim() || null;
    const color = input.color ?? before.color;
    const size = input.size ?? before.size;

    if (sku && sku !== before.sku) {
      const clash = await prisma.productVariant.findUnique({ where: { sku } });
      if (clash) throw new AppError('DUPLICATE_SKU', { sku });
    }
    if (barcode && barcode !== before.barcode) {
      const clash = await prisma.productVariant.findUnique({ where: { barcode } });
      if (clash) throw new AppError('DUPLICATE_BARCODE', { barcode });
    }
    if (color !== before.color || size !== before.size) {
      const clash = await prisma.productVariant.findUnique({
        where: { productId_color_size: { productId: before.productId, color, size } },
      });
      if (clash && clash.id !== id) throw new AppError('DUPLICATE_VARIANT', { color, size });
    }

    const after = await prisma.productVariant.update({
      where: { id },
      data: {
        ...(sku !== undefined ? { sku } : {}),
        ...(barcode !== undefined ? { barcode } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.size !== undefined ? { size: input.size } : {}),
        ...(input.costPrice !== undefined ? { costPriceCents: toMinor(input.costPrice) } : {}),
        ...(input.sellingPrice !== undefined ? { sellingPriceCents: toMinor(input.sellingPrice) } : {}),
        ...(input.minimumStock !== undefined ? { minimumStock: input.minimumStock } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });

    const priceChanged =
      after.sellingPriceCents !== before.sellingPriceCents ||
      after.costPriceCents !== before.costPriceCents;

    await AuditService.record({
      userId: actor.userId,
      action: priceChanged ? AUDIT_ACTIONS.PRICE_CHANGED : AUDIT_ACTIONS.VARIANT_UPDATED,
      entityType: 'ProductVariant',
      entityId: id,
      oldValue: priceChanged
        ? { sellingPrice: toMajor(before.sellingPriceCents), costPrice: toMajor(before.costPriceCents) }
        : { sku: before.sku, color: before.color, size: before.size, active: before.active },
      newValue: priceChanged
        ? { sellingPrice: toMajor(after.sellingPriceCents), costPrice: toMajor(after.costPriceCents) }
        : { sku: after.sku, color: after.color, size: after.size, active: after.active },
      ip: actor.ip,
    });

    return this.getById(id);
  },

  async remove(id: number, actor: Actor, hard = false) {
    const before = await prisma.productVariant.findUnique({ where: { id }, include: { inventory: true } });
    if (!before) throw new AppError('VARIANT_NOT_FOUND');

    if (hard) {
      const [orderUses, purchaseUses] = await Promise.all([
        prisma.orderItem.count({ where: { variantId: id } }),
        prisma.purchaseItem.count({ where: { variantId: id } }),
      ]);
      if (orderUses > 0 || purchaseUses > 0) {
        throw new AppError(
          'CONFLICT',
          'Variant has order or purchase history and cannot be hard-deleted; deactivate it instead.',
        );
      }
      await prisma.productVariant.delete({ where: { id } });
    } else {
      await prisma.productVariant.update({ where: { id }, data: { active: false } });
    }

    await AuditService.record({
      userId: actor.userId,
      action: AUDIT_ACTIONS.VARIANT_DELETED,
      entityType: 'ProductVariant',
      entityId: id,
      oldValue: { sku: before.sku, active: before.active, quantity: before.inventory?.quantity ?? 0 },
      newValue: { deleted: hard, active: false },
      ip: actor.ip,
    });

    return { id, deleted: hard, deactivated: !hard };
  },
};
