import { prisma, Prisma } from '../db/prisma';
import { runInTransaction } from '../db/transaction';
import { AppError } from '../errors/AppError';
import {
  CANCELLABLE_ORDER_STATUSES,
  ORDER_STATUS_TRANSITIONS,
  SEQUENCE_KEYS,
  type OrderSource,
  type OrderStatus,
  type PaymentMethod,
} from '../config/constants';
import { nextDocumentNumber } from '../utils/sequence';
import { toMinor } from '../utils/money';
import { InventoryService } from './inventory.service';
import { AuditService, AUDIT_ACTIONS } from './audit.service';
import { adminOrder, customerOrder } from '../serializers/order.serializer';
import type { Actor } from './category.service';

export const ORDER_INCLUDE = {
  items: { orderBy: { id: 'asc' } },
  customer: { select: { id: true, name: true, email: true, phone: true } },
  createdBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

/** One requested line. The variant may be addressed by id, SKU or barcode (POS scanner). */
export interface OrderLineInput {
  variantId?: number;
  sku?: string;
  barcode?: string;
  quantity: number;
  /** Optional per-line discount in major units. Never a price override. */
  discount?: number;
}

interface PricedLine {
  variantId: number;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  totalCents: number;
  productName: string;
  variantSku: string;
  color: string;
  size: string;
}

/**
 * Resolves each requested line against the database and prices it there.
 * Client-supplied prices, totals and stock figures are ignored entirely — the only
 * things taken from the request are which variant, how many, and an optional discount.
 */
export async function priceLines(
  tx: Prisma.TransactionClient,
  lines: OrderLineInput[],
  opts: { requireActive: boolean },
): Promise<PricedLine[]> {
  if (!lines.length) throw new AppError('EMPTY_ORDER');

  // Merge repeated references to the same variant into a single line.
  const resolved: PricedLine[] = [];
  const byVariant = new Map<number, PricedLine>();

  for (const line of lines) {
    const quantity = Math.trunc(line.quantity);
    if (quantity <= 0) throw new AppError('VALIDATION_ERROR', 'Quantity must be greater than zero.');

    const variant = await findVariant(tx, line);
    if (opts.requireActive) {
      if (!variant.active) throw new AppError('VARIANT_INACTIVE', { sku: variant.sku });
      if (!variant.product.active) throw new AppError('PRODUCT_INACTIVE', { product: variant.product.name });
    }

    const discountCents = toMinor(line.discount ?? 0);
    const grossCents = variant.sellingPriceCents * quantity;
    if (discountCents > grossCents) {
      throw new AppError('DISCOUNT_TOO_LARGE', 'Line discount cannot exceed the line total.');
    }

    const existing = byVariant.get(variant.id);
    if (existing) {
      existing.quantity += quantity;
      existing.discountCents += discountCents;
      existing.totalCents = existing.unitPriceCents * existing.quantity - existing.discountCents;
      continue;
    }

    const priced: PricedLine = {
      variantId: variant.id,
      quantity,
      // Price snapshot: historical orders keep this value even if the variant is repriced.
      unitPriceCents: variant.sellingPriceCents,
      discountCents,
      totalCents: grossCents - discountCents,
      productName: variant.product.name,
      variantSku: variant.sku,
      color: variant.color,
      size: variant.size,
    };
    byVariant.set(variant.id, priced);
    resolved.push(priced);
  }

  return resolved;
}

async function findVariant(tx: Prisma.TransactionClient, line: OrderLineInput) {
  const where: Prisma.ProductVariantWhereInput | null = line.variantId
    ? { id: line.variantId }
    : line.sku
      ? { sku: line.sku.trim().toUpperCase() }
      : line.barcode
        ? { barcode: line.barcode.trim() }
        : null;
  if (!where) throw new AppError('VALIDATION_ERROR', 'Each line needs a variantId, sku or barcode.');

  const variant = await tx.productVariant.findFirst({
    where,
    include: { product: { select: { id: true, name: true, active: true } } },
  });
  if (!variant) throw new AppError('VARIANT_NOT_FOUND', { requested: line });
  return variant;
}

export interface OrderTotals {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
}

/** Subtotal is gross of discounts; discount is line discounts plus any order-level discount. */
export function computeTotals(
  lines: PricedLine[],
  orderDiscount: { amount?: number; percent?: number } = {},
): OrderTotals {
  const subtotalCents = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
  const lineDiscountCents = lines.reduce((sum, l) => sum + l.discountCents, 0);

  let headerDiscountCents = 0;
  if (orderDiscount.percent !== undefined) {
    if (orderDiscount.percent < 0 || orderDiscount.percent > 100) {
      throw new AppError('VALIDATION_ERROR', 'Discount percent must be between 0 and 100.');
    }
    headerDiscountCents = Math.round(((subtotalCents - lineDiscountCents) * orderDiscount.percent) / 100);
  } else if (orderDiscount.amount !== undefined) {
    headerDiscountCents = toMinor(orderDiscount.amount);
  }

  const discountCents = lineDiscountCents + headerDiscountCents;
  if (discountCents > subtotalCents) throw new AppError('DISCOUNT_TOO_LARGE');

  return { subtotalCents, discountCents, totalCents: subtotalCents - discountCents };
}

export function assertTransition(from: OrderStatus, to: OrderStatus) {
  if (from === to) return;
  if (!ORDER_STATUS_TRANSITIONS[from].includes(to)) {
    throw new AppError('INVALID_STATUS_TRANSITION', `Cannot move an order from ${from} to ${to}.`, {
      from,
      to,
      allowed: ORDER_STATUS_TRANSITIONS[from],
    });
  }
}

/**
 * Deducts stock for every line of an order exactly once.
 * The `stockCommitted` flag is flipped with a guarded updateMany, so even if two
 * requests race to complete the same order only one of them can consume stock.
 */
export async function commitStock(
  tx: Prisma.TransactionClient,
  orderId: number,
  actor: { userId?: number | null },
) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  if (order.stockCommitted) return false;

  const claimed = await tx.order.updateMany({
    where: { id: orderId, stockCommitted: false },
    data: { stockCommitted: true },
  });
  if (claimed.count === 0) return false;

  for (const item of order.items) {
    await InventoryService.applyChange(tx, {
      variantId: item.variantId,
      type: 'SALE',
      quantity: item.quantity,
      referenceType: 'ORDER',
      referenceId: order.id,
      userId: actor.userId ?? null,
      note: `Sold on order ${order.orderNumber}`,
    });
  }
  return true;
}

/** Puts stock back for a cancelled order; also guarded so it can only happen once. */
export async function releaseStock(
  tx: Prisma.TransactionClient,
  orderId: number,
  actor: { userId?: number | null },
  note: string,
) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  if (!order.stockCommitted) return false;

  const released = await tx.order.updateMany({
    where: { id: orderId, stockCommitted: true },
    data: { stockCommitted: false },
  });
  if (released.count === 0) return false;

  for (const item of order.items) {
    await InventoryService.applyChange(tx, {
      variantId: item.variantId,
      type: 'ADJUSTMENT_IN',
      quantity: item.quantity,
      referenceType: 'ORDER_CANCELLATION',
      referenceId: order.id,
      userId: actor.userId ?? null,
      note,
    });
  }
  return true;
}

/** Shared creation routine for both POS and online orders. */
export async function createOrderInTx(
  tx: Prisma.TransactionClient,
  input: {
    source: OrderSource;
    customerId?: number | null;
    customerName?: string | null;
    customerPhone?: string | null;
    lines: OrderLineInput[];
    discount?: number;
    discountPercent?: number;
    note?: string | null;
    createdById?: number | null;
    paymentMethod?: PaymentMethod | null;
    /** When true, stock is deducted as part of this same transaction. */
    commitStockNow: boolean;
    status: OrderStatus;
    paymentStatus?: 'UNPAID' | 'PAID';
    actorUserId?: number | null;
  },
) {
  const lines = await priceLines(tx, input.lines, { requireActive: true });
  const totals = computeTotals(lines, { amount: input.discount, percent: input.discountPercent });

  const sequenceKey = input.source === 'POS' ? SEQUENCE_KEYS.ORDER_POS : SEQUENCE_KEYS.ORDER_ONLINE;
  const prefix = input.source === 'POS' ? 'POS' : 'SO';
  const orderNumber = await nextDocumentNumber(tx, sequenceKey, prefix);

  const order = await tx.order.create({
    data: {
      orderNumber,
      customerId: input.customerId ?? null,
      source: input.source,
      status: input.status,
      subtotalCents: totals.subtotalCents,
      discountCents: totals.discountCents,
      totalCents: totals.totalCents,
      paymentStatus: input.paymentStatus ?? 'UNPAID',
      paymentMethod: input.paymentMethod ?? null,
      createdById: input.createdById ?? null,
      customerName: input.customerName ?? null,
      customerPhone: input.customerPhone ?? null,
      note: input.note ?? null,
      completedAt: input.status === 'COMPLETED' ? new Date() : null,
      items: {
        create: lines.map((l) => ({
          variantId: l.variantId,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          discountCents: l.discountCents,
          totalCents: l.totalCents,
          productName: l.productName,
          variantSku: l.variantSku,
          color: l.color,
          size: l.size,
        })),
      },
    },
  });

  if (input.commitStockNow) {
    await commitStock(tx, order.id, { userId: input.actorUserId ?? null });
  }

  return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: ORDER_INCLUDE });
}

export const OrderService = {
  async list(params: {
    skip: number;
    take: number;
    status?: OrderStatus;
    source?: OrderSource;
    paymentStatus?: string;
    customerId?: number;
    search?: string;
    from?: Date;
    to?: Date;
  }) {
    const where: Prisma.OrderWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.source ? { source: params.source } : {}),
      ...(params.paymentStatus ? { paymentStatus: params.paymentStatus } : {}),
      ...(params.customerId ? { customerId: params.customerId } : {}),
      ...(params.search
        ? {
            OR: [
              { orderNumber: { contains: params.search } },
              { customerName: { contains: params.search } },
              { customer: { name: { contains: params.search } } },
              { customer: { email: { contains: params.search } } },
            ],
          }
        : {}),
      ...(params.from || params.to
        ? {
            createdAt: {
              ...(params.from ? { gte: params.from } : {}),
              ...(params.to ? { lte: params.to } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { id: 'desc' },
        include: ORDER_INCLUDE,
      }),
      prisma.order.count({ where }),
    ]);
    return { items: rows.map(adminOrder), total };
  },

  async getById(id: number) {
    const order = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) throw new AppError('ORDER_NOT_FOUND');
    return adminOrder(order);
  },

  /** Raw row fetch used where ownership must be checked before serialisation. */
  async getRaw(id: number) {
    const order = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) throw new AppError('ORDER_NOT_FOUND');
    return order;
  },

  async getByNumber(orderNumber: string) {
    const order = await prisma.order.findUnique({ where: { orderNumber }, include: ORDER_INCLUDE });
    if (!order) throw new AppError('ORDER_NOT_FOUND');
    return adminOrder(order);
  },

  /**
   * Generic admin status change with transition validation and the stock side-effects
   * each target status implies.
   */
  async updateStatus(
    id: number,
    next: OrderStatus,
    actor: Actor,
    opts: { paymentMethod?: PaymentMethod; reason?: string } = {},
  ) {
    const updated = await runInTransaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id }, include: { items: true } });
      if (!order) throw new AppError('ORDER_NOT_FOUND');

      const current = order.status as OrderStatus;
      assertTransition(current, next);
      if (current === next) return tx.order.findUniqueOrThrow({ where: { id }, include: ORDER_INCLUDE });

      const data: Prisma.OrderUpdateInput = { status: next };

      if (next === 'CANCELLED') {
        const openReturns = await tx.return.count({
          where: { orderId: id, status: { in: ['ACCEPTED', 'REQUESTED'] } },
        });
        if (openReturns > 0) {
          throw new AppError(
            'ORDER_NOT_CANCELLABLE',
            'This order has returns against it; process a refund instead of cancelling.',
          );
        }
        await releaseStock(tx, id, actor, `Cancelled order ${order.orderNumber}`);
        data.cancelledAt = new Date();
        if (order.paymentStatus === 'PAID') data.paymentStatus = 'REFUNDED';
      }

      if (next === 'PAID') {
        data.paymentStatus = 'PAID';
        if (opts.paymentMethod) data.paymentMethod = opts.paymentMethod;
        await commitStock(tx, id, actor);
      }

      if (next === 'COMPLETED') {
        await commitStock(tx, id, actor);
        data.completedAt = new Date();
        if (order.paymentStatus === 'UNPAID') data.paymentStatus = 'PAID';
      }

      if (next === 'CONFIRMED') {
        await commitStock(tx, id, actor);
      }

      if (next === 'REFUNDED') {
        data.paymentStatus = 'REFUNDED';
      }

      if (opts.reason) data.note = opts.reason;

      await tx.order.update({ where: { id }, data });
      return tx.order.findUniqueOrThrow({ where: { id }, include: ORDER_INCLUDE });
    });

    await AuditService.record({
      userId: actor.userId,
      action: AUDIT_ACTIONS.ORDER_STATUS_CHANGED,
      entityType: 'Order',
      entityId: id,
      newValue: { status: next, reason: opts.reason ?? null },
      ip: actor.ip,
    });

    return adminOrder(updated);
  },

  /**
   * Cancels an order and restores any stock it had consumed.
   * `customerId` restricts the cancellation to that customer's own orders.
   */
  async cancel(
    id: number,
    actor: { userId: number; ip?: string | null },
    opts: { reason?: string; customerId?: number; cancelWindowHours?: number } = {},
  ) {
    const updated = await runInTransaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id }, include: { items: true } });
      if (!order) throw new AppError('ORDER_NOT_FOUND');

      if (opts.customerId !== undefined && order.customerId !== opts.customerId) {
        // Do not reveal that another customer's order exists.
        throw new AppError('ORDER_NOT_FOUND');
      }

      const current = order.status as OrderStatus;
      if (!CANCELLABLE_ORDER_STATUSES.includes(current)) throw new AppError('ORDER_NOT_CANCELLABLE');
      assertTransition(current, 'CANCELLED');

      // Cancelling restores the full order quantity. If some of it has already come
      // back through a return, doing so would credit the same physical units twice.
      const openReturns = await tx.return.count({
        where: { orderId: id, status: { in: ['ACCEPTED', 'REQUESTED'] } },
      });
      if (openReturns > 0) {
        throw new AppError(
          'ORDER_NOT_CANCELLABLE',
          'This order has returns against it; process a refund instead of cancelling.',
        );
      }

      // Customers additionally have a time-boxed cancellation window.
      if (opts.customerId !== undefined && opts.cancelWindowHours !== undefined) {
        const ageHours = (Date.now() - order.createdAt.getTime()) / 36e5;
        if (ageHours > opts.cancelWindowHours) throw new AppError('CANCEL_WINDOW_EXPIRED');
      }

      await releaseStock(tx, id, actor, `Cancelled order ${order.orderNumber}`);

      await tx.order.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          paymentStatus: order.paymentStatus === 'PAID' ? 'REFUNDED' : order.paymentStatus,
          note: opts.reason ?? order.note,
        },
      });

      return tx.order.findUniqueOrThrow({ where: { id }, include: ORDER_INCLUDE });
    });

    await AuditService.record({
      userId: actor.userId,
      action: AUDIT_ACTIONS.ORDER_CANCELLED,
      entityType: 'Order',
      entityId: id,
      newValue: { status: 'CANCELLED', reason: opts.reason ?? null, orderNumber: updated.orderNumber },
      ip: actor.ip,
    });

    return updated;
  },

  serializeForAdmin: adminOrder,
  serializeForCustomer: customerOrder,
};
