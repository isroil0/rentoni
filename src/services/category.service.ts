import { prisma } from '../db/prisma';
import { AppError } from '../errors/AppError';
import { AuditService, AUDIT_ACTIONS } from './audit.service';

export interface Actor {
  userId: number;
  ip?: string | null;
}

export const CategoryService = {
  async list(params: { skip: number; take: number; search?: string; active?: boolean }) {
    const where = {
      ...(params.active !== undefined ? { active: params.active } : {}),
      ...(params.search ? { name: { contains: params.search, mode: 'insensitive' as const } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.category.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { name: 'asc' },
        include: { _count: { select: { products: true } } },
      }),
      prisma.category.count({ where }),
    ]);
    return {
      items: items.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        active: c.active,
        productCount: c._count.products,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      total,
    };
  },

  async getById(id: number) {
    const category = await prisma.category.findUnique({ where: { id } });
    if (!category) throw new AppError('CATEGORY_NOT_FOUND');
    return category;
  },

  async create(input: { name: string; description?: string; active?: boolean }, actor: Actor) {
    const existing = await prisma.category.findUnique({ where: { name: input.name } });
    if (existing) throw new AppError('CATEGORY_NAME_EXISTS');

    const category = await prisma.category.create({
      data: { name: input.name, description: input.description ?? null, active: input.active ?? true },
    });
    await AuditService.record({
      userId: actor.userId,
      action: AUDIT_ACTIONS.CATEGORY_CREATED,
      entityType: 'Category',
      entityId: category.id,
      newValue: category,
      ip: actor.ip,
    });
    return category;
  },

  async update(
    id: number,
    input: { name?: string; description?: string | null; active?: boolean },
    actor: Actor,
  ) {
    const before = await this.getById(id);
    if (input.name && input.name !== before.name) {
      const clash = await prisma.category.findUnique({ where: { name: input.name } });
      if (clash) throw new AppError('CATEGORY_NAME_EXISTS');
    }
    const after = await prisma.category.update({ where: { id }, data: input });
    await AuditService.record({
      userId: actor.userId,
      action: AUDIT_ACTIONS.CATEGORY_UPDATED,
      entityType: 'Category',
      entityId: id,
      oldValue: before,
      newValue: after,
      ip: actor.ip,
    });
    return after;
  },

  /** Soft-deletes by default; a hard delete is refused while products still reference it. */
  async remove(id: number, actor: Actor, hard = false) {
    const before = await this.getById(id);
    const productCount = await prisma.product.count({ where: { categoryId: id } });

    if (hard) {
      if (productCount > 0) throw new AppError('CATEGORY_HAS_PRODUCTS');
      await prisma.category.delete({ where: { id } });
    } else {
      await prisma.category.update({ where: { id }, data: { active: false } });
    }

    await AuditService.record({
      userId: actor.userId,
      action: AUDIT_ACTIONS.CATEGORY_DELETED,
      entityType: 'Category',
      entityId: id,
      oldValue: before,
      newValue: { deleted: hard, active: false },
      ip: actor.ip,
    });
    return { id, deleted: hard, deactivated: !hard };
  },

  /** Public listing — active categories that actually have something to show. */
  async publicList() {
    const rows = await prisma.category.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: { where: { active: true } } } } },
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      productCount: c._count.products,
    }));
  },
};
