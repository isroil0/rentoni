import { prisma, type Tx } from '../db/prisma';
import { runInTransaction } from '../db/transaction';
import { AppError } from '../errors/AppError';
import {
  INBOUND_TRANSACTION_TYPES,
  type InventoryTransactionType,
  type ReferenceType,
} from '../config/constants';
import { stockStatus } from '../utils/stock';
import { AuditService, AUDIT_ACTIONS } from './audit.service';

export interface StockChangeInput {
  variantId: number;
  type: InventoryTransactionType;
  /** Always a positive magnitude — direction is derived from `type`. */
  quantity: number;
  referenceType?: ReferenceType;
  referenceId?: number | null;
  userId?: number | null;
  note?: string | null;
}

/**
 * THE single place where stock is allowed to change.
 *
 * Every mutation is performed with one atomic conditional UPDATE:
 *
 *   UPDATE inventory SET quantity = quantity + :delta
 *    WHERE variant_id = :id AND quantity + :delta >= 0
 *
 * If the guard fails the statement matches zero rows and we raise INSUFFICIENT_STOCK.
 * Because the write itself performs the check, two concurrent sales of the last unit
 * cannot both succeed: the second one either waits on the row/database lock and then
 * matches zero rows, or is serialised by the connection pool — either way stock can
 * never go negative. A CHECK constraint on `inventory.quantity` backs this up at the
 * database level.
 *
 * Every successful change writes an immutable InventoryTransaction row.
 */
export const InventoryService = {
  /** Creates the single inventory row that must exist for every variant. */
  async ensureRecord(tx: Tx, variantId: number, initialQuantity = 0) {
    const existing = await tx.inventory.findUnique({ where: { variantId } });
    if (existing) return existing;
    return tx.inventory.create({ data: { variantId, quantity: initialQuantity } });
  },

  signedDelta(type: InventoryTransactionType, quantity: number): number {
    const magnitude = Math.abs(quantity);
    return INBOUND_TRANSACTION_TYPES.includes(type) ? magnitude : -magnitude;
  },

  /**
   * Applies one stock movement atomically and records the inventory transaction.
   * MUST be called inside a transaction when combined with other writes (orders,
   * purchases, returns) so the whole operation commits or rolls back together.
   */
  async applyChange(tx: Tx, input: StockChangeInput) {
    const quantity = Math.abs(Math.trunc(input.quantity));
    if (quantity <= 0) {
      throw new AppError('INVALID_ADJUSTMENT', 'Quantity must be a positive integer.');
    }

    const delta = this.signedDelta(input.type, quantity);
    const now = new Date();

    // Atomic guarded update — the WHERE clause is the concurrency control.
    const affected = await tx.$executeRaw`
      UPDATE inventory
         SET quantity = quantity + ${delta},
             updated_at = ${now}
       WHERE variant_id = ${input.variantId}
         AND quantity + ${delta} >= 0
    `;

    if (affected === 0) {
      const inventory = await tx.inventory.findUnique({
        where: { variantId: input.variantId },
        include: { variant: { select: { sku: true } } },
      });
      if (!inventory) throw new AppError('INVENTORY_NOT_FOUND');
      throw new AppError('INSUFFICIENT_STOCK', {
        variantId: input.variantId,
        sku: inventory.variant.sku,
        available: inventory.quantity,
        requested: quantity,
      });
    }

    const updated = await tx.inventory.findUniqueOrThrow({ where: { variantId: input.variantId } });
    const newQuantity = updated.quantity;
    const previousQuantity = newQuantity - delta;

    return tx.inventoryTransaction.create({
      data: {
        variantId: input.variantId,
        type: input.type,
        quantity: delta,
        previousQuantity,
        newQuantity,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        userId: input.userId ?? null,
        note: input.note ?? null,
      },
    });
  },

  /** Applies several movements in order; the caller's transaction makes it all-or-nothing. */
  async applyMany(tx: Tx, changes: StockChangeInput[]) {
    const results = [];
    for (const change of changes) {
      results.push(await this.applyChange(tx, change));
    }
    return results;
  },

  /**
   * Sets stock to an absolute value by recording the difference as an adjustment.
   * Used by the admin "adjust" endpoint and by seed/verification tooling.
   */
  async setAbsolute(
    tx: Tx,
    input: { variantId: number; quantity: number; userId?: number | null; note?: string | null },
  ) {
    const current = await tx.inventory.findUnique({ where: { variantId: input.variantId } });
    if (!current) throw new AppError('INVENTORY_NOT_FOUND');

    const target = Math.trunc(input.quantity);
    if (target < 0) throw new AppError('INVALID_ADJUSTMENT', 'Target quantity cannot be negative.');

    const delta = target - current.quantity;
    if (delta === 0) return null;

    return this.applyChange(tx, {
      variantId: input.variantId,
      type: delta > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
      quantity: Math.abs(delta),
      referenceType: 'MANUAL',
      userId: input.userId ?? null,
      note: input.note ?? `Stock set to ${target}`,
    });
  },

  /** Admin adjustment endpoint: relative delta or absolute target, always audited. */
  async adjust(input: {
    variantId: number;
    type: Extract<InventoryTransactionType, 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'DAMAGE'>;
    quantity?: number;
    setQuantity?: number;
    note?: string | null;
    userId: number;
    ip?: string | null;
  }) {
    return runInTransaction(async (tx) => {
      const variant = await tx.productVariant.findUnique({
        where: { id: input.variantId },
        include: { inventory: true },
      });
      if (!variant) throw new AppError('VARIANT_NOT_FOUND');
      await this.ensureRecord(tx, variant.id);

      const before = variant.inventory?.quantity ?? 0;

      const transaction =
        input.setQuantity !== undefined
          ? await this.setAbsolute(tx, {
              variantId: variant.id,
              quantity: input.setQuantity,
              userId: input.userId,
              note: input.note ?? `Stock set to ${input.setQuantity}`,
            })
          : await this.applyChange(tx, {
              variantId: variant.id,
              type: input.type,
              quantity: input.quantity ?? 0,
              referenceType: 'MANUAL',
              userId: input.userId,
              note: input.note ?? null,
            });

      const after = await tx.inventory.findUniqueOrThrow({ where: { variantId: variant.id } });

      await AuditService.record(
        {
          userId: input.userId,
          action: AUDIT_ACTIONS.INVENTORY_ADJUSTED,
          entityType: 'ProductVariant',
          entityId: variant.id,
          oldValue: { quantity: before },
          newValue: { quantity: after.quantity, type: input.type, note: input.note ?? null },
          ip: input.ip ?? null,
        },
        tx,
      );

      return {
        variantId: variant.id,
        sku: variant.sku,
        previousQuantity: before,
        quantity: after.quantity,
        minimumStock: variant.minimumStock,
        status: stockStatus(after.quantity, variant.minimumStock),
        transaction,
      };
    });
  },

  async getByVariant(variantId: number) {
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { inventory: true, product: { select: { id: true, name: true, brand: true } } },
    });
    if (!variant) throw new AppError('VARIANT_NOT_FOUND');
    const quantity = variant.inventory?.quantity ?? 0;
    return {
      variantId: variant.id,
      sku: variant.sku,
      barcode: variant.barcode,
      color: variant.color,
      size: variant.size,
      product: variant.product,
      quantity,
      minimumStock: variant.minimumStock,
      status: stockStatus(quantity, variant.minimumStock),
      updatedAt: variant.inventory?.updatedAt ?? null,
    };
  },

  /**
   * Inventory listing with search + stock-status filtering.
   * LOW_STOCK/OUT_OF_STOCK need a comparison between two columns, which Prisma cannot
   * express in `where`, so those two filters are applied after loading the matching rows.
   */
  async list(params: {
    skip: number;
    take: number;
    search?: string;
    categoryId?: number;
    productId?: number;
    status?: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
    active?: boolean;
  }) {
    const where = {
      ...(params.active !== undefined ? { active: params.active } : {}),
      ...(params.productId ? { productId: params.productId } : {}),
      ...(params.categoryId ? { product: { categoryId: params.categoryId } } : {}),
      ...(params.search
        ? {
            OR: [
              { sku: { contains: params.search, mode: 'insensitive' as const } },
              { barcode: { contains: params.search, mode: 'insensitive' as const } },
              { color: { contains: params.search, mode: 'insensitive' as const } },
              { product: { name: { contains: params.search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const rows = await prisma.productVariant.findMany({
      where,
      include: {
        inventory: true,
        product: { select: { id: true, name: true, brand: true, categoryId: true } },
      },
      orderBy: { id: 'asc' },
    });

    const mapped = rows.map((v) => {
      const quantity = v.inventory?.quantity ?? 0;
      return {
        variantId: v.id,
        sku: v.sku,
        barcode: v.barcode,
        color: v.color,
        size: v.size,
        active: v.active,
        product: v.product,
        quantity,
        minimumStock: v.minimumStock,
        status: stockStatus(quantity, v.minimumStock),
        stockValueCents: quantity * v.costPriceCents,
        updatedAt: v.inventory?.updatedAt ?? null,
      };
    });

    const filtered = params.status ? mapped.filter((m) => m.status === params.status) : mapped;
    return {
      items: filtered.slice(params.skip, params.skip + params.take),
      total: filtered.length,
    };
  },

  async listTransactions(params: {
    skip: number;
    take: number;
    variantId?: number;
    type?: InventoryTransactionType;
    referenceType?: ReferenceType;
    referenceId?: number;
    userId?: number;
    from?: Date;
    to?: Date;
  }) {
    const where = {
      ...(params.variantId ? { variantId: params.variantId } : {}),
      ...(params.type ? { type: params.type } : {}),
      ...(params.referenceType ? { referenceType: params.referenceType } : {}),
      ...(params.referenceId ? { referenceId: params.referenceId } : {}),
      ...(params.userId ? { userId: params.userId } : {}),
      ...(params.from || params.to
        ? {
            createdAt: {
              ...(params.from ? { gte: params.from } : {}),
              ...(params.to ? { lte: params.to } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.inventoryTransaction.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { id: 'desc' },
        include: {
          variant: {
            select: { id: true, sku: true, color: true, size: true, product: { select: { id: true, name: true } } },
          },
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.inventoryTransaction.count({ where }),
    ]);
    return { items, total };
  },

  /** Variants at or below their minimum stock (excluding zero unless includeOutOfStock). */
  async lowStock(params: { skip: number; take: number; includeOutOfStock?: boolean }) {
    const rows = await prisma.$queryRaw<
      {
        variant_id: number;
        sku: string;
        color: string;
        size: string;
        quantity: number;
        minimum_stock: number;
        product_id: number;
        product_name: string;
      }[]
    >`
      SELECT v.id AS variant_id, v.sku, v.color, v.size, i.quantity, v.minimum_stock,
             p.id AS product_id, p.name AS product_name
        FROM product_variants v
        JOIN inventory i ON i.variant_id = v.id
        JOIN products p ON p.id = v.product_id
       WHERE v.active = true AND i.quantity <= v.minimum_stock
       ORDER BY i.quantity ASC, v.id ASC
    `;

    const mapped = rows
      .map((r) => ({
        variantId: r.variant_id,
        sku: r.sku,
        color: r.color,
        size: r.size,
        quantity: r.quantity,
        minimumStock: r.minimum_stock,
        product: { id: r.product_id, name: r.product_name },
        status: stockStatus(r.quantity, r.minimum_stock),
      }))
      .filter((r) => (params.includeOutOfStock === false ? r.status === 'LOW_STOCK' : true));

    return { items: mapped.slice(params.skip, params.skip + params.take), total: mapped.length };
  },

  async outOfStock(params: { skip: number; take: number }) {
    const where = { active: true, inventory: { quantity: { lte: 0 } } };
    const [rows, total] = await Promise.all([
      prisma.productVariant.findMany({
        where,
        skip: params.skip,
        take: params.take,
        include: { inventory: true, product: { select: { id: true, name: true } } },
        orderBy: { id: 'asc' },
      }),
      prisma.productVariant.count({ where }),
    ]);
    return {
      items: rows.map((v) => ({
        variantId: v.id,
        sku: v.sku,
        color: v.color,
        size: v.size,
        quantity: v.inventory?.quantity ?? 0,
        minimumStock: v.minimumStock,
        product: v.product,
        status: 'OUT_OF_STOCK' as const,
      })),
      total,
    };
  },
};
