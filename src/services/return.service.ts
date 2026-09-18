import { prisma, Prisma } from '../db/prisma';
import { runInTransaction } from '../db/transaction';
import { AppError } from '../errors/AppError';
import {
  RETURNABLE_ORDER_STATUSES,
  SEQUENCE_KEYS,
  SETTING_KEYS,
  type OrderStatus,
} from '../config/constants';
import { nextDocumentNumber } from '../utils/sequence';
import { toMajor } from '../utils/money';
import { InventoryService } from './inventory.service';
import { AuditService, AUDIT_ACTIONS } from './audit.service';
import { SettingsService } from './settings.service';
import type { Actor } from './category.service';

const RETURN_INCLUDE = {
  order: { select: { id: true, orderNumber: true, customerId: true, status: true, source: true } },
  variant: {
    select: { id: true, sku: true, color: true, size: true, product: { select: { id: true, name: true } } },
  },
  createdBy: { select: { id: true, name: true, email: true, role: true } },
} satisfies Prisma.ReturnInclude;

type ReturnWithRelations = Prisma.ReturnGetPayload<{ include: typeof RETURN_INCLUDE }>;

function serialize(row: ReturnWithRelations) {
  return {
    id: row.id,
    returnNumber: row.returnNumber,
    orderId: row.orderId,
    orderNumber: row.order.orderNumber,
    variantId: row.variantId,
    sku: row.variant.sku,
    productName: row.variant.product.name,
    color: row.variant.color,
    size: row.variant.size,
    quantity: row.quantity,
    reason: row.reason,
    status: row.status,
    refundAmount: toMajor(row.refundCents),
    createdById: row.createdById,
    createdBy: row.createdBy,
    processedAt: row.processedAt,
    createdAt: row.createdAt,
  };
}

export interface ReturnLineInput {
  variantId: number;
  quantity: number;
  reason?: string;
}

/**
 * How many units of a variant are still eligible for return on an order:
 *   ordered - (already accepted + still pending)
 * Pending requests are counted so a customer cannot open several requests that add up
 * to more than they bought.
 */
async function eligibleQuantity(
  tx: Prisma.TransactionClient,
  orderId: number,
  variantId: number,
): Promise<{ ordered: number; alreadyReturned: number; eligible: number; unitPriceCents: number }> {
  const item = await tx.orderItem.findFirst({ where: { orderId, variantId } });
  if (!item) throw new AppError('ITEM_NOT_IN_ORDER', { variantId });

  const prior = await tx.return.aggregate({
    where: { orderId, variantId, status: { in: ['ACCEPTED', 'REQUESTED'] } },
    _sum: { quantity: true },
  });
  const alreadyReturned = prior._sum.quantity ?? 0;

  return {
    ordered: item.quantity,
    alreadyReturned,
    eligible: item.quantity - alreadyReturned,
    unitPriceCents: item.quantity > 0 ? Math.round(item.totalCents / item.quantity) : 0,
  };
}

export const ReturnService = {
  async list(params: {
    skip: number;
    take: number;
    orderId?: number;
    variantId?: number;
    status?: string;
    customerId?: number;
    from?: Date;
    to?: Date;
  }) {
    const where: Prisma.ReturnWhereInput = {
      ...(params.orderId ? { orderId: params.orderId } : {}),
      ...(params.variantId ? { variantId: params.variantId } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.customerId ? { order: { customerId: params.customerId } } : {}),
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
      prisma.return.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { id: 'desc' },
        include: RETURN_INCLUDE,
      }),
      prisma.return.count({ where }),
    ]);
    return { items: rows.map(serialize), total };
  },

  async getById(id: number, opts: { customerId?: number } = {}) {
    const row = await prisma.return.findFirst({
      where: { id, ...(opts.customerId ? { order: { customerId: opts.customerId } } : {}) },
      include: RETURN_INCLUDE,
    });
    if (!row) throw new AppError('RETURN_NOT_FOUND');
    return serialize(row);
  },

  /** What can still be returned on a given order — used by the admin returns screen. */
  async eligibility(orderId: number, opts: { customerId?: number } = {}) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, ...(opts.customerId ? { customerId: opts.customerId } : {}) },
      include: { items: true },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND');

    const lines = await Promise.all(
      order.items.map(async (item) => {
        const prior = await prisma.return.aggregate({
          where: { orderId, variantId: item.variantId, status: { in: ['ACCEPTED', 'REQUESTED'] } },
          _sum: { quantity: true },
        });
        const alreadyReturned = prior._sum.quantity ?? 0;
        return {
          variantId: item.variantId,
          sku: item.variantSku,
          productName: item.productName,
          color: item.color,
          size: item.size,
          ordered: item.quantity,
          alreadyReturned,
          eligible: item.quantity - alreadyReturned,
          unitPrice: toMajor(item.unitPriceCents),
        };
      }),
    );

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      returnable: RETURNABLE_ORDER_STATUSES.includes(order.status as OrderStatus),
      lines,
    };
  },

  /**
   * Creates one or more return lines against an order.
   *
   * `autoAccept` (admin) restores stock immediately inside the same transaction and
   * writes a RETURN inventory transaction per line. Customer-raised returns are created
   * as REQUESTED and only touch stock once an admin accepts them.
   */
  async create(
    input: {
      orderId: number;
      lines: ReturnLineInput[];
      reason?: string;
      autoAccept: boolean;
      /** When set, restricts the operation to this customer's own order. */
      customerId?: number;
    },
    actor: Actor,
  ) {
    if (!input.lines.length) throw new AppError('BAD_REQUEST', 'A return must contain at least one line.');

    const returnWindowDays = await SettingsService.getNumber(SETTING_KEYS.CUSTOMER_RETURN_WINDOW_DAYS, 14);

    const created = await runInTransaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: input.orderId } });
      if (!order) throw new AppError('ORDER_NOT_FOUND');

      if (input.customerId !== undefined && order.customerId !== input.customerId) {
        throw new AppError('ORDER_NOT_FOUND');
      }
      if (!RETURNABLE_ORDER_STATUSES.includes(order.status as OrderStatus)) {
        throw new AppError('ORDER_NOT_RETURNABLE', {
          status: order.status,
          returnableStatuses: RETURNABLE_ORDER_STATUSES,
        });
      }
      if (input.customerId !== undefined) {
        const ageDays = (Date.now() - order.createdAt.getTime()) / 864e5;
        if (ageDays > returnWindowDays) throw new AppError('RETURN_WINDOW_EXPIRED');
      }

      // Merge repeated lines so eligibility is checked against the true total.
      const merged = new Map<number, ReturnLineInput>();
      for (const line of input.lines) {
        const existing = merged.get(line.variantId);
        if (existing) existing.quantity += line.quantity;
        else merged.set(line.variantId, { ...line });
      }

      const rows: ReturnWithRelations[] = [];

      for (const line of merged.values()) {
        if (line.quantity <= 0) throw new AppError('VALIDATION_ERROR', 'Return quantity must be positive.');

        const { ordered, alreadyReturned, eligible, unitPriceCents } = await eligibleQuantity(
          tx,
          order.id,
          line.variantId,
        );
        if (line.quantity > eligible) {
          throw new AppError('INVALID_RETURN_QUANTITY', {
            variantId: line.variantId,
            ordered,
            alreadyReturned,
            eligible,
            requested: line.quantity,
          });
        }

        const returnNumber = await nextDocumentNumber(tx, SEQUENCE_KEYS.RETURN, 'RET');

        const row = await tx.return.create({
          data: {
            returnNumber,
            orderId: order.id,
            variantId: line.variantId,
            quantity: line.quantity,
            reason: line.reason ?? input.reason ?? null,
            status: input.autoAccept ? 'ACCEPTED' : 'REQUESTED',
            refundCents: unitPriceCents * line.quantity,
            createdById: actor.userId,
            processedAt: input.autoAccept ? new Date() : null,
          },
          include: RETURN_INCLUDE,
        });

        if (input.autoAccept) {
          await InventoryService.applyChange(tx, {
            variantId: line.variantId,
            type: 'RETURN',
            quantity: line.quantity,
            referenceType: 'RETURN',
            referenceId: row.id,
            userId: actor.userId,
            note: `Returned against order ${order.orderNumber}`,
          });
        }

        rows.push(row);
      }

      return rows;
    });

    for (const row of created) {
      await AuditService.record({
        userId: actor.userId,
        action: input.autoAccept ? AUDIT_ACTIONS.RETURN_ACCEPTED : AUDIT_ACTIONS.RETURN_CREATED,
        entityType: 'Return',
        entityId: row.id,
        newValue: {
          returnNumber: row.returnNumber,
          orderId: row.orderId,
          variantId: row.variantId,
          quantity: row.quantity,
          status: row.status,
        },
        ip: actor.ip,
      });
    }

    return created.map(serialize);
  },

  /** Admin acceptance of a customer-requested return: restores stock atomically. */
  async accept(id: number, actor: Actor, note?: string) {
    const row = await runInTransaction(async (tx) => {
      const existing = await tx.return.findUnique({ where: { id }, include: { order: true } });
      if (!existing) throw new AppError('RETURN_NOT_FOUND');
      if (existing.status !== 'REQUESTED') throw new AppError('RETURN_ALREADY_PROCESSED');

      // Guarded flip — a concurrent second acceptance finds no REQUESTED row.
      const claimed = await tx.return.updateMany({
        where: { id, status: 'REQUESTED' },
        data: { status: 'ACCEPTED', processedAt: new Date() },
      });
      if (claimed.count === 0) throw new AppError('RETURN_ALREADY_PROCESSED');

      await InventoryService.applyChange(tx, {
        variantId: existing.variantId,
        type: 'RETURN',
        quantity: existing.quantity,
        referenceType: 'RETURN',
        referenceId: existing.id,
        userId: actor.userId,
        note: note ?? `Returned against order ${existing.order.orderNumber}`,
      });

      return tx.return.findUniqueOrThrow({ where: { id }, include: RETURN_INCLUDE });
    });

    await AuditService.record({
      userId: actor.userId,
      action: AUDIT_ACTIONS.RETURN_ACCEPTED,
      entityType: 'Return',
      entityId: id,
      oldValue: { status: 'REQUESTED' },
      newValue: { status: 'ACCEPTED', quantity: row.quantity },
      ip: actor.ip,
    });

    return serialize(row);
  },

  async reject(id: number, actor: Actor, reason?: string) {
    const row = await runInTransaction(async (tx) => {
      const existing = await tx.return.findUnique({ where: { id } });
      if (!existing) throw new AppError('RETURN_NOT_FOUND');
      if (existing.status !== 'REQUESTED') throw new AppError('RETURN_ALREADY_PROCESSED');

      await tx.return.updateMany({
        where: { id, status: 'REQUESTED' },
        data: { status: 'REJECTED', processedAt: new Date(), reason: reason ?? existing.reason },
      });
      return tx.return.findUniqueOrThrow({ where: { id }, include: RETURN_INCLUDE });
    });

    await AuditService.record({
      userId: actor.userId,
      action: AUDIT_ACTIONS.RETURN_REJECTED,
      entityType: 'Return',
      entityId: id,
      newValue: { status: 'REJECTED', reason: reason ?? null },
      ip: actor.ip,
    });

    return serialize(row);
  },

  async listOwn(customerId: number, params: { skip: number; take: number; status?: string }) {
    return this.list({ ...params, customerId });
  },
};
