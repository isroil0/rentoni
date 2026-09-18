import { prisma } from '../db/prisma';
import { runInTransaction } from '../db/transaction';
import { AppError } from '../errors/AppError';
import { SETTING_KEYS, type PaymentMethod } from '../config/constants';
import { toMajor } from '../utils/money';
import { customerOrder } from '../serializers/order.serializer';
import { AuditService, AUDIT_ACTIONS } from './audit.service';
import { SettingsService } from './settings.service';
import {
  ORDER_INCLUDE,
  OrderService,
  createOrderInTx,
  type OrderLineInput,
} from './order.service';

/**
 * Online storefront orders.
 *
 * Stock is deducted at order creation (reserve-on-order), inside the same transaction
 * that writes the order and its items. If any line is short the whole order fails and
 * nothing is persisted, so a customer can never "hold" stock that was not available.
 */
export const CustomerOrderService = {
  async create(
    customerId: number,
    input: {
      lines?: OrderLineInput[];
      fromCart?: boolean;
      paymentMethod?: PaymentMethod;
      note?: string;
      shippingPhone?: string;
    },
    ctx: { ip?: string | null } = {},
  ) {
    const order = await runInTransaction(async (tx) => {
      const customer = await tx.user.findFirst({ where: { id: customerId, role: 'CUSTOMER' } });
      if (!customer) throw new AppError('CUSTOMER_NOT_FOUND');
      if (!customer.active) throw new AppError('ACCOUNT_INACTIVE');

      let lines = input.lines ?? [];

      if (input.fromCart) {
        const cart = await tx.cart.findUnique({ where: { customerId }, include: { items: true } });
        if (!cart || cart.items.length === 0) throw new AppError('CART_EMPTY');
        lines = cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
      }

      if (!lines.length) throw new AppError('EMPTY_ORDER');

      // Customers may never send a discount — pricing is entirely server-side.
      const created = await createOrderInTx(tx, {
        source: 'ONLINE',
        customerId,
        customerName: customer.name,
        customerPhone: input.shippingPhone ?? customer.phone,
        lines: lines.map((l) => ({ variantId: l.variantId, sku: l.sku, quantity: l.quantity })),
        note: input.note ?? null,
        createdById: customerId,
        paymentMethod: input.paymentMethod ?? null,
        commitStockNow: true,
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        actorUserId: customerId,
      });

      if (input.fromCart) {
        await tx.cartItem.deleteMany({ where: { cart: { customerId } } });
      }

      return created;
    });

    await AuditService.record({
      userId: customerId,
      action: AUDIT_ACTIONS.ORDER_CREATED,
      entityType: 'Order',
      entityId: order.id,
      newValue: { orderNumber: order.orderNumber, source: 'ONLINE', total: toMajor(order.totalCents) },
      ip: ctx.ip ?? null,
    });

    return customerOrder(order);
  },

  /** Scoped by customerId at the query level — a customer can only ever list their own. */
  async listOwn(customerId: number, params: { skip: number; take: number; status?: string }) {
    const where = {
      customerId,
      ...(params.status ? { status: params.status } : {}),
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
    return { items: rows.map(customerOrder), total };
  },

  /**
   * Fetches one of the customer's own orders. Another customer's id yields ORDER_NOT_FOUND
   * rather than FORBIDDEN, so the API does not confirm that the order exists.
   */
  async getOwn(customerId: number, orderId: number) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, customerId },
      include: ORDER_INCLUDE,
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND');
    return customerOrder(order);
  },

  async cancelOwn(customerId: number, orderId: number, reason: string | undefined, ip?: string | null) {
    const windowHours = await SettingsService.getNumber(SETTING_KEYS.CUSTOMER_CANCEL_WINDOW_HOURS, 24);
    const cancelled = await OrderService.cancel(
      orderId,
      { userId: customerId, ip },
      { reason, customerId, cancelWindowHours: windowHours },
    );
    return customerOrder(cancelled);
  },
};

/** Persistent shopping cart. Pricing and availability are always recomputed server-side. */
export const CartService = {
  async get(customerId: number) {
    const cart = await prisma.cart.upsert({
      where: { customerId },
      create: { customerId },
      update: {},
      include: {
        items: {
          orderBy: { id: 'asc' },
          include: {
            variant: {
              include: { inventory: true, product: { select: { id: true, name: true, brand: true, active: true } } },
            },
          },
        },
      },
    });

    const items = cart.items.map((item) => {
      const available = item.variant.inventory?.quantity ?? 0;
      return {
        id: item.id,
        variantId: item.variantId,
        productId: item.variant.product.id,
        productName: item.variant.product.name,
        sku: item.variant.sku,
        color: item.variant.color,
        size: item.variant.size,
        quantity: item.quantity,
        unitPrice: toMajor(item.variant.sellingPriceCents),
        lineTotal: toMajor(item.variant.sellingPriceCents * item.quantity),
        available: available >= item.quantity,
        purchasable: item.variant.active && item.variant.product.active && available >= item.quantity,
      };
    });

    const subtotalCents = cart.items.reduce(
      (sum, i) => sum + i.variant.sellingPriceCents * i.quantity,
      0,
    );

    return {
      id: cart.id,
      items,
      itemCount: items.reduce((n, i) => n + i.quantity, 0),
      subtotal: toMajor(subtotalCents),
      readyForCheckout: items.length > 0 && items.every((i) => i.purchasable),
    };
  },

  async addItem(customerId: number, input: { variantId: number; quantity: number }) {
    const variant = await prisma.productVariant.findUnique({
      where: { id: input.variantId },
      include: { product: true },
    });
    if (!variant) throw new AppError('VARIANT_NOT_FOUND');
    if (!variant.active) throw new AppError('VARIANT_INACTIVE');
    if (!variant.product.active) throw new AppError('PRODUCT_INACTIVE');

    const cart = await prisma.cart.upsert({
      where: { customerId },
      create: { customerId },
      update: {},
    });

    await prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId: input.variantId } },
      create: { cartId: cart.id, variantId: input.variantId, quantity: input.quantity },
      update: { quantity: { increment: input.quantity } },
    });

    return this.get(customerId);
  },

  async setItemQuantity(customerId: number, variantId: number, quantity: number) {
    const cart = await prisma.cart.findUnique({ where: { customerId } });
    if (!cart) throw new AppError('CART_EMPTY');

    if (quantity <= 0) {
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id, variantId } });
    } else {
      const item = await prisma.cartItem.findUnique({
        where: { cartId_variantId: { cartId: cart.id, variantId } },
      });
      if (!item) throw new AppError('NOT_FOUND', 'That item is not in your cart.');
      await prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
    }
    return this.get(customerId);
  },

  async removeItem(customerId: number, variantId: number) {
    const cart = await prisma.cart.findUnique({ where: { customerId } });
    if (cart) await prisma.cartItem.deleteMany({ where: { cartId: cart.id, variantId } });
    return this.get(customerId);
  },

  async clear(customerId: number) {
    const cart = await prisma.cart.findUnique({ where: { customerId } });
    if (cart) await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.get(customerId);
  },
};
