import { prisma } from '../db/prisma';
import { runInTransaction } from '../db/transaction';
import { AppError } from '../errors/AppError';
import type { OrderStatus, PaymentMethod } from '../config/constants';
import { stockStatus } from '../utils/stock';
import { toMajor } from '../utils/money';
import { AuditService, AUDIT_ACTIONS } from './audit.service';
import {
  ORDER_INCLUDE,
  assertTransition,
  commitStock,
  computeTotals,
  createOrderInTx,
  priceLines,
  type OrderLineInput,
} from './order.service';
import { adminOrder } from '../serializers/order.serializer';
import type { Actor } from './category.service';

/**
 * Point of sale — a SUPER_ADMIN-only feature, not a separate role.
 *
 * Flow:
 *   POST /pos/orders              -> PENDING ticket, stock NOT yet deducted
 *   POST /pos/orders/:id/complete -> deducts stock + marks PAID/COMPLETED (one transaction)
 *   POST /pos/orders/:id/cancel   -> CANCELLED, restoring stock if it had been deducted
 *
 * Passing `completeNow: true` to create runs both steps inside a single transaction,
 * which is the normal path for a walk-in counter sale.
 */
export const PosService = {
  /** Catalogue lookup for the POS screen: free text, SKU or barcode. */
  async search(params: { query: string; limit?: number }) {
    const q = params.query.trim();
    const take = Math.min(params.limit ?? 20, 50);

    const variants = await prisma.productVariant.findMany({
      where: {
        active: true,
        product: { active: true },
        OR: [
          { sku: { contains: q.toUpperCase() } },
          { barcode: { contains: q } },
          { color: { contains: q } },
          { product: { name: { contains: q } } },
          { product: { brand: { contains: q } } },
        ],
      },
      take,
      include: { inventory: true, product: { select: { id: true, name: true, brand: true } } },
      orderBy: [{ productId: 'asc' }, { id: 'asc' }],
    });

    return variants.map((v) => {
      const quantity = v.inventory?.quantity ?? 0;
      return {
        variantId: v.id,
        productId: v.product.id,
        productName: v.product.name,
        brand: v.product.brand,
        sku: v.sku,
        barcode: v.barcode,
        color: v.color,
        size: v.size,
        price: toMajor(v.sellingPriceCents),
        quantity,
        stockStatus: stockStatus(quantity, v.minimumStock),
      };
    });
  },

  /** Server-side price/total preview for the POS cart. Never writes anything. */
  async quote(input: { lines: OrderLineInput[]; discount?: number; discountPercent?: number }) {
    return runInTransaction(async (tx) => {
      const lines = await priceLines(tx, input.lines, { requireActive: true });
      const totals = computeTotals(lines, { amount: input.discount, percent: input.discountPercent });

      const availability = await Promise.all(
        lines.map(async (l) => {
          const inv = await tx.inventory.findUnique({ where: { variantId: l.variantId } });
          return {
            variantId: l.variantId,
            sku: l.variantSku,
            requested: l.quantity,
            available: inv?.quantity ?? 0,
            sufficient: (inv?.quantity ?? 0) >= l.quantity,
          };
        }),
      );

      return {
        items: lines.map((l) => ({
          variantId: l.variantId,
          sku: l.variantSku,
          productName: l.productName,
          color: l.color,
          size: l.size,
          quantity: l.quantity,
          unitPrice: toMajor(l.unitPriceCents),
          discount: toMajor(l.discountCents),
          total: toMajor(l.totalCents),
        })),
        subtotal: toMajor(totals.subtotalCents),
        discount: toMajor(totals.discountCents),
        total: toMajor(totals.totalCents),
        availability,
        canComplete: availability.every((a) => a.sufficient),
      };
    });
  },

  async createOrder(
    input: {
      lines: OrderLineInput[];
      discount?: number;
      discountPercent?: number;
      customerId?: number | null;
      customerName?: string | null;
      customerPhone?: string | null;
      paymentMethod?: PaymentMethod;
      note?: string;
      completeNow?: boolean;
    },
    actor: Actor,
  ) {
    const order = await runInTransaction(async (tx) => {
      if (input.customerId) {
        const customer = await tx.user.findFirst({ where: { id: input.customerId, role: 'CUSTOMER' } });
        if (!customer) throw new AppError('CUSTOMER_NOT_FOUND');
      }

      return createOrderInTx(tx, {
        source: 'POS',
        // POS sales may be anonymous — customerId is nullable by design.
        customerId: input.customerId ?? null,
        customerName: input.customerName ?? null,
        customerPhone: input.customerPhone ?? null,
        lines: input.lines,
        discount: input.discount,
        discountPercent: input.discountPercent,
        note: input.note ?? null,
        createdById: actor.userId,
        paymentMethod: input.completeNow ? (input.paymentMethod ?? 'CASH') : (input.paymentMethod ?? null),
        commitStockNow: Boolean(input.completeNow),
        status: input.completeNow ? 'COMPLETED' : 'PENDING',
        paymentStatus: input.completeNow ? 'PAID' : 'UNPAID',
        actorUserId: actor.userId,
      });
    });

    await AuditService.record({
      userId: actor.userId,
      action: input.completeNow ? AUDIT_ACTIONS.ORDER_COMPLETED : AUDIT_ACTIONS.ORDER_CREATED,
      entityType: 'Order',
      entityId: order.id,
      newValue: {
        orderNumber: order.orderNumber,
        source: 'POS',
        status: order.status,
        total: toMajor(order.totalCents),
      },
      ip: actor.ip,
    });

    return adminOrder(order);
  },

  /**
   * Completes a POS ticket. Stock deduction, payment and the status flip all happen
   * inside one transaction, so a stock shortfall rolls the whole sale back.
   */
  async complete(id: number, input: { paymentMethod?: PaymentMethod; note?: string }, actor: Actor) {
    const order = await runInTransaction(async (tx) => {
      const existing = await tx.order.findUnique({ where: { id } });
      if (!existing) throw new AppError('ORDER_NOT_FOUND');
      if (existing.source !== 'POS') throw new AppError('BAD_REQUEST', 'This is not a POS order.');
      if (existing.status === 'COMPLETED') throw new AppError('ORDER_ALREADY_COMPLETED');

      assertTransition(existing.status as OrderStatus, 'COMPLETED');

      await commitStock(tx, id, actor);

      await tx.order.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          paymentStatus: 'PAID',
          paymentMethod: input.paymentMethod ?? existing.paymentMethod ?? 'CASH',
          completedAt: new Date(),
          ...(input.note ? { note: input.note } : {}),
        },
      });

      return tx.order.findUniqueOrThrow({ where: { id }, include: ORDER_INCLUDE });
    });

    await AuditService.record({
      userId: actor.userId,
      action: AUDIT_ACTIONS.ORDER_COMPLETED,
      entityType: 'Order',
      entityId: id,
      newValue: {
        orderNumber: order.orderNumber,
        total: toMajor(order.totalCents),
        paymentMethod: order.paymentMethod,
      },
      ip: actor.ip,
    });

    return adminOrder(order);
  },

  async cancel(id: number, input: { reason?: string }, actor: Actor) {
    const existing = await prisma.order.findUnique({ where: { id } });
    if (!existing) throw new AppError('ORDER_NOT_FOUND');
    if (existing.source !== 'POS') throw new AppError('BAD_REQUEST', 'This is not a POS order.');

    const { OrderService } = await import('./order.service');
    const cancelled = await OrderService.cancel(id, actor, { reason: input.reason });
    return adminOrder(cancelled);
  },

  /** Printable receipt payload for a completed sale. */
  async receipt(id: number) {
    const order = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) throw new AppError('ORDER_NOT_FOUND');
    return {
      orderNumber: order.orderNumber,
      date: order.completedAt ?? order.createdAt,
      status: order.status,
      cashier: order.createdBy?.name ?? null,
      customer: order.customer?.name ?? order.customerName ?? 'Walk-in',
      items: order.items.map((i) => ({
        name: i.productName,
        sku: i.variantSku,
        color: i.color,
        size: i.size,
        quantity: i.quantity,
        unitPrice: toMajor(i.unitPriceCents),
        total: toMajor(i.totalCents),
      })),
      subtotal: toMajor(order.subtotalCents),
      discount: toMajor(order.discountCents),
      total: toMajor(order.totalCents),
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
    };
  },
};
