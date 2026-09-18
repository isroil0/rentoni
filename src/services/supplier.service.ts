import { prisma } from '../db/prisma';
import { AppError } from '../errors/AppError';
import { AuditService, AUDIT_ACTIONS } from './audit.service';
import type { Actor } from './category.service';

export const SupplierService = {
  async list(params: { skip: number; take: number; search?: string; active?: boolean }) {
    const where = {
      ...(params.active !== undefined ? { active: params.active } : {}),
      ...(params.search
        ? { OR: [{ name: { contains: params.search, mode: 'insensitive' as const } }, { phone: { contains: params.search, mode: 'insensitive' as const } }] }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { name: 'asc' },
        include: { _count: { select: { purchases: true } } },
      }),
      prisma.supplier.count({ where }),
    ]);
    return {
      items: items.map((s) => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        address: s.address,
        notes: s.notes,
        active: s.active,
        purchaseCount: s._count.purchases,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      total,
    };
  },

  async getById(id: number) {
    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new AppError('SUPPLIER_NOT_FOUND');
    return supplier;
  },

  async create(
    input: { name: string; phone?: string; address?: string; notes?: string; active?: boolean },
    actor: Actor,
  ) {
    const supplier = await prisma.supplier.create({
      data: {
        name: input.name,
        phone: input.phone ?? null,
        address: input.address ?? null,
        notes: input.notes ?? null,
        active: input.active ?? true,
      },
    });
    await AuditService.record({
      userId: actor.userId,
      action: AUDIT_ACTIONS.SUPPLIER_CREATED,
      entityType: 'Supplier',
      entityId: supplier.id,
      newValue: supplier,
      ip: actor.ip,
    });
    return supplier;
  },

  async update(
    id: number,
    input: { name?: string; phone?: string | null; address?: string | null; notes?: string | null; active?: boolean },
    actor: Actor,
  ) {
    const before = await this.getById(id);
    const after = await prisma.supplier.update({ where: { id }, data: input });
    await AuditService.record({
      userId: actor.userId,
      action: AUDIT_ACTIONS.SUPPLIER_UPDATED,
      entityType: 'Supplier',
      entityId: id,
      oldValue: before,
      newValue: after,
      ip: actor.ip,
    });
    return after;
  },

  async remove(id: number, actor: Actor, hard = false) {
    const before = await this.getById(id);
    const purchaseCount = await prisma.purchase.count({ where: { supplierId: id } });

    if (hard) {
      if (purchaseCount > 0) throw new AppError('SUPPLIER_HAS_PURCHASES');
      await prisma.supplier.delete({ where: { id } });
    } else {
      await prisma.supplier.update({ where: { id }, data: { active: false } });
    }

    await AuditService.record({
      userId: actor.userId,
      action: AUDIT_ACTIONS.SUPPLIER_DELETED,
      entityType: 'Supplier',
      entityId: id,
      oldValue: before,
      newValue: { deleted: hard, active: false },
      ip: actor.ip,
    });
    return { id, deleted: hard, deactivated: !hard };
  },
};
