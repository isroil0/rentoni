import { prisma } from '../db/prisma';
import { runInTransaction } from '../db/transaction';
import { AppError } from '../errors/AppError';
import { toMajor } from '../utils/money';
import { toPublicUser } from './auth.service';
import { AuditService, AUDIT_ACTIONS } from './audit.service';
import type { Actor } from './category.service';

/** Admin-side customer management plus the customer's own profile operations. */
export const CustomerService = {
  async list(params: { skip: number; take: number; search?: string; active?: boolean }) {
    const where = {
      role: 'CUSTOMER',
      ...(params.active !== undefined ? { active: params.active } : {}),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' as const } },
              { email: { contains: params.search, mode: 'insensitive' as const } },
              { phone: { contains: params.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { id: 'desc' },
        include: { _count: { select: { customerOrders: true } } },
      }),
      prisma.user.count({ where }),
    ]);

    // Lifetime value from non-cancelled orders only.
    const spendByCustomer = await prisma.order.groupBy({
      by: ['customerId'],
      where: {
        customerId: { in: rows.map((r) => r.id) },
        status: { notIn: ['CANCELLED', 'REFUNDED'] },
      },
      _sum: { totalCents: true },
    });
    const spendMap = new Map(spendByCustomer.map((s) => [s.customerId, s._sum.totalCents ?? 0]));

    return {
      items: rows.map((r) => ({
        ...toPublicUser(r),
        orderCount: r._count.customerOrders,
        totalSpent: toMajor(spendMap.get(r.id) ?? 0),
      })),
      total,
    };
  },

  async getById(id: number) {
    const customer = await prisma.user.findFirst({
      where: { id, role: 'CUSTOMER' },
      include: {
        _count: { select: { customerOrders: true } },
        customerOrders: {
          take: 10,
          orderBy: { id: 'desc' },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalCents: true,
            createdAt: true,
            paymentStatus: true,
          },
        },
      },
    });
    if (!customer) throw new AppError('CUSTOMER_NOT_FOUND');

    const spend = await prisma.order.aggregate({
      where: { customerId: id, status: { notIn: ['CANCELLED', 'REFUNDED'] } },
      _sum: { totalCents: true },
    });

    return {
      ...toPublicUser(customer),
      orderCount: customer._count.customerOrders,
      totalSpent: toMajor(spend._sum.totalCents ?? 0),
      recentOrders: customer.customerOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        paymentStatus: o.paymentStatus,
        total: toMajor(o.totalCents),
        createdAt: o.createdAt,
      })),
    };
  },

  /** Activating/deactivating a customer account. Revokes sessions on deactivation. */
  async setStatus(id: number, active: boolean, actor: Actor) {
    const customer = await prisma.user.findFirst({ where: { id, role: 'CUSTOMER' } });
    if (!customer) throw new AppError('CUSTOMER_NOT_FOUND');
    if (customer.id === actor.userId) throw new AppError('CANNOT_MODIFY_SELF');

    const updated = await runInTransaction(async (tx) => {
      const user = await tx.user.update({ where: { id }, data: { active } });
      if (!active) {
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return user;
    });

    await AuditService.record({
      userId: actor.userId,
      action: AUDIT_ACTIONS.CUSTOMER_STATUS_CHANGED,
      entityType: 'User',
      entityId: id,
      oldValue: { active: customer.active },
      newValue: { active },
      ip: actor.ip,
    });

    return toPublicUser(updated);
  },

  async getProfile(customerId: number) {
    const user = await prisma.user.findUnique({ where: { id: customerId } });
    if (!user) throw new AppError('CUSTOMER_NOT_FOUND');
    return toPublicUser(user);
  },

  /**
   * Profile self-update. Only name/phone/email are editable — role and active are not
   * part of the accepted shape, so privilege escalation via this endpoint is impossible.
   */
  async updateProfile(customerId: number, input: { name?: string; phone?: string | null; email?: string }) {
    if (input.email) {
      const email = input.email.toLowerCase().trim();
      const clash = await prisma.user.findUnique({ where: { email } });
      if (clash && clash.id !== customerId) throw new AppError('EMAIL_ALREADY_EXISTS');
      input.email = email;
    }
    const user = await prisma.user.update({
      where: { id: customerId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
      },
    });
    return toPublicUser(user);
  },
};
