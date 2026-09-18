import { prisma, Prisma } from '../db/prisma';
import { runInTransaction } from '../db/transaction';
import { AppError } from '../errors/AppError';
import { SEQUENCE_KEYS } from '../config/constants';
import { nextDocumentNumber } from '../utils/sequence';
import { toMajor, toMinor } from '../utils/money';
import { InventoryService } from './inventory.service';
import { AuditService, AUDIT_ACTIONS } from './audit.service';
import type { Actor } from './category.service';

const PURCHASE_INCLUDE = {
  supplier: { select: { id: true, name: true, phone: true, active: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  items: {
    include: {
      variant: {
        select: { id: true, sku: true, color: true, size: true, product: { select: { id: true, name: true } } },
      },
    },
  },
} satisfies Prisma.PurchaseInclude;

type PurchaseWithRelations = Prisma.PurchaseGetPayload<{ include: typeof PURCHASE_INCLUDE }>;

function serialize(purchase: PurchaseWithRelations) {
  return {
    id: purchase.id,
    purchaseNumber: purchase.purchaseNumber,
    supplierId: purchase.supplierId,
    supplier: purchase.supplier,
    status: purchase.status,
    totalCost: toMajor(purchase.totalCostCents),
    createdById: purchase.createdById,
    createdBy: purchase.createdBy,
    note: purchase.note,
    receivedAt: purchase.receivedAt,
    cancelledAt: purchase.cancelledAt,
    createdAt: purchase.createdAt,
    updatedAt: purchase.updatedAt,
    items: purchase.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      sku: item.variant.sku,
      color: item.variant.color,
      size: item.variant.size,
      productName: item.variant.product.name,
      quantity: item.quantity,
      unitCost: toMajor(item.unitCostCents),
      total: toMajor(item.totalCents),
    })),
    itemCount: purchase.items.reduce((n, i) => n + i.quantity, 0),
  };
}

export interface PurchaseItemInput {
  variantId: number;
  quantity: number;
  unitCost: number;
}

export const PurchaseService = {
  async list(params: {
    skip: number;
    take: number;
    status?: string;
    supplierId?: number;
    search?: string;
    from?: Date;
    to?: Date;
  }) {
    const where: Prisma.PurchaseWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.supplierId ? { supplierId: params.supplierId } : {}),
      ...(params.search ? { purchaseNumber: { contains: params.search, mode: 'insensitive' as const } } : {}),
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
      prisma.purchase.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { id: 'desc' },
        include: PURCHASE_INCLUDE,
      }),
      prisma.purchase.count({ where }),
    ]);
    return { items: rows.map(serialize), total };
  },

  async getById(id: number) {
    const purchase = await prisma.purchase.findUnique({ where: { id }, include: PURCHASE_INCLUDE });
    if (!purchase) throw new AppError('PURCHASE_NOT_FOUND');
    return serialize(purchase);
  },

  /**
   * Creates a purchase. A purchase can be created as a DRAFT and received later, or
   * received immediately (`receiveNow: true`) — in which case creation and stock intake
   * happen inside a single transaction.
   */
  async create(
    input: {
      supplierId: number;
      items: PurchaseItemInput[];
      note?: string;
      receiveNow?: boolean;
    },
    actor: Actor,
  ) {
    if (!input.items.length) throw new AppError('BAD_REQUEST', 'A purchase must contain at least one item.');

    const result = await runInTransaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier) throw new AppError('SUPPLIER_NOT_FOUND');
      if (!supplier.active) throw new AppError('SUPPLIER_INACTIVE');

      // Merge duplicate lines for the same variant so the (purchase, variant) unique
      // constraint cannot be violated by a sloppy client payload.
      const merged = new Map<number, PurchaseItemInput>();
      for (const item of input.items) {
        const existing = merged.get(item.variantId);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          merged.set(item.variantId, { ...item });
        }
      }

      const variantIds = [...merged.keys()];
      const variants = await tx.productVariant.findMany({ where: { id: { in: variantIds } } });
      if (variants.length !== variantIds.length) throw new AppError('VARIANT_NOT_FOUND');

      const lines = [...merged.values()].map((item) => {
        const unitCostCents = toMinor(item.unitCost);
        return {
          variantId: item.variantId,
          quantity: item.quantity,
          unitCostCents,
          totalCents: unitCostCents * item.quantity,
        };
      });
      const totalCostCents = lines.reduce((sum, l) => sum + l.totalCents, 0);

      const purchaseNumber = await nextDocumentNumber(tx, SEQUENCE_KEYS.PURCHASE, 'PO');

      const purchase = await tx.purchase.create({
        data: {
          purchaseNumber,
          supplierId: input.supplierId,
          status: 'DRAFT',
          totalCostCents,
          createdById: actor.userId,
          note: input.note ?? null,
          items: { create: lines },
        },
      });

      if (input.receiveNow) {
        await receiveInTx(tx, purchase.id, actor);
      }

      return tx.purchase.findUniqueOrThrow({ where: { id: purchase.id }, include: PURCHASE_INCLUDE });
    });

    await AuditService.record({
      userId: actor.userId,
      action: AUDIT_ACTIONS.PURCHASE_CREATED,
      entityType: 'Purchase',
      entityId: result.id,
      newValue: {
        purchaseNumber: result.purchaseNumber,
        supplierId: result.supplierId,
        totalCost: toMajor(result.totalCostCents),
        status: result.status,
      },
      ip: actor.ip,
    });

    return serialize(result);
  },

  /**
   * Receives a DRAFT purchase: every line increases stock and writes a PURCHASE
   * inventory transaction, then the purchase flips to RECEIVED. The status guard is
   * applied inside the transaction, so receiving the same purchase twice is impossible.
   */
  async receive(id: number, actor: Actor) {
    const result = await runInTransaction(async (tx) => {
      await receiveInTx(tx, id, actor);
      return tx.purchase.findUniqueOrThrow({ where: { id }, include: PURCHASE_INCLUDE });
    });

    await AuditService.record({
      userId: actor.userId,
      action: AUDIT_ACTIONS.PURCHASE_RECEIVED,
      entityType: 'Purchase',
      entityId: id,
      oldValue: { status: 'DRAFT' },
      newValue: {
        status: 'RECEIVED',
        purchaseNumber: result.purchaseNumber,
        units: result.items.reduce((n, i) => n + i.quantity, 0),
      },
      ip: actor.ip,
    });

    return serialize(result);
  },

  async cancel(id: number, actor: Actor, reason?: string) {
    const result = await runInTransaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({ where: { id } });
      if (!purchase) throw new AppError('PURCHASE_NOT_FOUND');
      if (purchase.status === 'RECEIVED') {
        throw new AppError(
          'PURCHASE_ALREADY_RECEIVED',
          'A received purchase cannot be cancelled; use an inventory adjustment instead.',
        );
      }
      if (purchase.status === 'CANCELLED') throw new AppError('PURCHASE_CANCELLED');

      await tx.purchase.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date(), note: reason ?? purchase.note },
      });
      return tx.purchase.findUniqueOrThrow({ where: { id }, include: PURCHASE_INCLUDE });
    });

    await AuditService.record({
      userId: actor.userId,
      action: AUDIT_ACTIONS.PURCHASE_CANCELLED,
      entityType: 'Purchase',
      entityId: id,
      newValue: { status: 'CANCELLED', reason: reason ?? null },
      ip: actor.ip,
    });

    return serialize(result);
  },
};

/** Shared receiving logic; always runs inside a caller-provided transaction. */
async function receiveInTx(tx: Prisma.TransactionClient, purchaseId: number, actor: Actor) {
  const purchase = await tx.purchase.findUnique({
    where: { id: purchaseId },
    include: { items: true },
  });
  if (!purchase) throw new AppError('PURCHASE_NOT_FOUND');
  if (purchase.status === 'RECEIVED') throw new AppError('PURCHASE_ALREADY_RECEIVED');
  if (purchase.status === 'CANCELLED') throw new AppError('PURCHASE_CANCELLED');
  if (!purchase.items.length) throw new AppError('BAD_REQUEST', 'Purchase has no items to receive.');

  for (const item of purchase.items) {
    await InventoryService.ensureRecord(tx, item.variantId);
    await InventoryService.applyChange(tx, {
      variantId: item.variantId,
      type: 'PURCHASE',
      quantity: item.quantity,
      referenceType: 'PURCHASE',
      referenceId: purchase.id,
      userId: actor.userId,
      note: `Received on purchase ${purchase.purchaseNumber}`,
    });
  }

  // Guarded status flip: only a DRAFT row is updated, so a concurrent second receive
  // finds zero rows affected and is rejected.
  const flipped = await tx.purchase.updateMany({
    where: { id: purchaseId, status: 'DRAFT' },
    data: { status: 'RECEIVED', receivedAt: new Date() },
  });
  if (flipped.count === 0) throw new AppError('PURCHASE_ALREADY_RECEIVED');
}
