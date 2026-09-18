import { prisma } from '../db/prisma';
import { toMajor } from '../utils/money';
import { stockStatus } from '../utils/stock';
import { resolveDateRange, type DatePreset } from '../utils/dates';

/**
 * Orders that count towards revenue: everything that is not cancelled or refunded.
 * Stock is committed the moment an order is created, so a PENDING order is a real sale
 * until it is cancelled. This matches the lifetime-spend figure in CustomerService.
 */
const NON_REVENUE_STATUSES = ['CANCELLED', 'REFUNDED'];

export interface RangeInput {
  from?: string;
  to?: string;
  preset?: DatePreset;
}

export const ReportService = {
  /** Headline figures for the SUPER_ADMIN dashboard. */
  async dashboardSummary(input: RangeInput = {}) {
    const range = resolveDateRange({ ...input, preset: input.preset ?? 'today' });
    const window = { gte: range.from, lte: range.to };

    const [
      orderAgg,
      itemsSold,
      inventoryAgg,
      variantRows,
      totalCustomers,
      activeCustomers,
      pendingOrders,
      returnsAgg,
      purchasesAgg,
      recentOrders,
    ] = await Promise.all([
      prisma.order.aggregate({
        where: { createdAt: window, status: { notIn: NON_REVENUE_STATUSES } },
        _sum: { totalCents: true, subtotalCents: true, discountCents: true },
        _count: { _all: true },
      }),
      prisma.orderItem.aggregate({
        where: { order: { createdAt: window, status: { notIn: NON_REVENUE_STATUSES } } },
        _sum: { quantity: true },
      }),
      prisma.inventory.aggregate({ _sum: { quantity: true } }),
      prisma.productVariant.findMany({
        where: { active: true },
        select: { id: true, minimumStock: true, costPriceCents: true, inventory: { select: { quantity: true } } },
      }),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.user.count({ where: { role: 'CUSTOMER', active: true } }),
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.return.aggregate({
        where: { createdAt: window, status: 'ACCEPTED' },
        _sum: { quantity: true, refundCents: true },
        _count: { _all: true },
      }),
      prisma.purchase.aggregate({
        where: { receivedAt: window, status: 'RECEIVED' },
        _sum: { totalCostCents: true },
        _count: { _all: true },
      }),
      prisma.order.findMany({
        take: 5,
        orderBy: { id: 'desc' },
        select: {
          id: true,
          orderNumber: true,
          source: true,
          status: true,
          totalCents: true,
          createdAt: true,
        },
      }),
    ]);

    let lowStock = 0;
    let outOfStock = 0;
    let stockValueCents = 0;
    for (const v of variantRows) {
      const qty = v.inventory?.quantity ?? 0;
      stockValueCents += qty * v.costPriceCents;
      const status = stockStatus(qty, v.minimumStock);
      if (status === 'OUT_OF_STOCK') outOfStock += 1;
      else if (status === 'LOW_STOCK') lowStock += 1;
    }

    // Profit needs the cost at the time of sale; we use the current variant cost price.
    const soldItems = await prisma.orderItem.findMany({
      where: { order: { createdAt: window, status: { notIn: NON_REVENUE_STATUSES } } },
      select: { quantity: true, totalCents: true, variant: { select: { costPriceCents: true } } },
    });
    const costOfGoodsCents = soldItems.reduce((sum, i) => sum + i.quantity * i.variant.costPriceCents, 0);
    const revenueCents = orderAgg._sum.totalCents ?? 0;

    return {
      range: { from: range.from, to: range.to, preset: input.preset ?? 'today' },
      sales: {
        orders: orderAgg._count._all,
        revenue: toMajor(revenueCents),
        grossSales: toMajor(orderAgg._sum.subtotalCents ?? 0),
        discounts: toMajor(orderAgg._sum.discountCents ?? 0),
        itemsSold: itemsSold._sum.quantity ?? 0,
        averageOrderValue: orderAgg._count._all
          ? toMajor(Math.round(revenueCents / orderAgg._count._all))
          : 0,
        costOfGoods: toMajor(costOfGoodsCents),
        profit: toMajor(revenueCents - costOfGoodsCents),
      },
      inventory: {
        totalUnits: inventoryAgg._sum.quantity ?? 0,
        stockValue: toMajor(stockValueCents),
        activeVariants: variantRows.length,
        lowStockVariants: lowStock,
        outOfStockVariants: outOfStock,
      },
      customers: { total: totalCustomers, active: activeCustomers },
      operations: {
        pendingOrders,
        returns: returnsAgg._count._all,
        unitsReturned: returnsAgg._sum.quantity ?? 0,
        refundValue: toMajor(returnsAgg._sum.refundCents ?? 0),
        purchasesReceived: purchasesAgg._count._all,
        purchaseCost: toMajor(purchasesAgg._sum.totalCostCents ?? 0),
      },
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        source: o.source,
        status: o.status,
        total: toMajor(o.totalCents),
        createdAt: o.createdAt,
      })),
    };
  },

  /** Sales over a period, broken down by day, by source and by payment method. */
  async salesReport(input: RangeInput & { source?: string } = {}) {
    const range = resolveDateRange(input);
    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: range.from, lte: range.to },
        status: { notIn: NON_REVENUE_STATUSES },
        ...(input.source ? { source: input.source } : {}),
      },
      select: {
        id: true,
        source: true,
        paymentMethod: true,
        subtotalCents: true,
        discountCents: true,
        totalCents: true,
        createdAt: true,
        items: { select: { quantity: true, totalCents: true, variant: { select: { costPriceCents: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const byDay = new Map<string, { orders: number; revenueCents: number; units: number }>();
    const bySource = new Map<string, { orders: number; revenueCents: number; units: number }>();
    const byPaymentMethod = new Map<string, { orders: number; revenueCents: number }>();

    let revenueCents = 0;
    let discountCents = 0;
    let grossCents = 0;
    let units = 0;
    let costCents = 0;

    for (const order of orders) {
      const day = order.createdAt.toISOString().slice(0, 10);
      const orderUnits = order.items.reduce((n, i) => n + i.quantity, 0);
      const orderCost = order.items.reduce((n, i) => n + i.quantity * i.variant.costPriceCents, 0);

      revenueCents += order.totalCents;
      discountCents += order.discountCents;
      grossCents += order.subtotalCents;
      units += orderUnits;
      costCents += orderCost;

      const d = byDay.get(day) ?? { orders: 0, revenueCents: 0, units: 0 };
      byDay.set(day, {
        orders: d.orders + 1,
        revenueCents: d.revenueCents + order.totalCents,
        units: d.units + orderUnits,
      });

      const s = bySource.get(order.source) ?? { orders: 0, revenueCents: 0, units: 0 };
      bySource.set(order.source, {
        orders: s.orders + 1,
        revenueCents: s.revenueCents + order.totalCents,
        units: s.units + orderUnits,
      });

      const pm = order.paymentMethod ?? 'UNSPECIFIED';
      const p = byPaymentMethod.get(pm) ?? { orders: 0, revenueCents: 0 };
      byPaymentMethod.set(pm, { orders: p.orders + 1, revenueCents: p.revenueCents + order.totalCents });
    }

    return {
      range: { from: range.from, to: range.to },
      totals: {
        orders: orders.length,
        grossSales: toMajor(grossCents),
        discounts: toMajor(discountCents),
        revenue: toMajor(revenueCents),
        unitsSold: units,
        costOfGoods: toMajor(costCents),
        profit: toMajor(revenueCents - costCents),
        averageOrderValue: orders.length ? toMajor(Math.round(revenueCents / orders.length)) : 0,
      },
      byDay: [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, orders: v.orders, revenue: toMajor(v.revenueCents), units: v.units })),
      bySource: [...bySource.entries()].map(([source, v]) => ({
        source,
        orders: v.orders,
        revenue: toMajor(v.revenueCents),
        units: v.units,
      })),
      byPaymentMethod: [...byPaymentMethod.entries()].map(([method, v]) => ({
        method,
        orders: v.orders,
        revenue: toMajor(v.revenueCents),
      })),
    };
  },

  /** Current inventory valuation plus low/out-of-stock breakdown. */
  async inventoryReport() {
    const variants = await prisma.productVariant.findMany({
      where: { active: true },
      include: {
        inventory: true,
        product: { select: { id: true, name: true, category: { select: { id: true, name: true } } } },
      },
      orderBy: { id: 'asc' },
    });

    let totalUnits = 0;
    let stockValueCents = 0;
    let retailValueCents = 0;
    const byStatus = { IN_STOCK: 0, LOW_STOCK: 0, OUT_OF_STOCK: 0 };
    const byCategory = new Map<string, { units: number; valueCents: number }>();

    const rows = variants.map((v) => {
      const quantity = v.inventory?.quantity ?? 0;
      const status = stockStatus(quantity, v.minimumStock);
      totalUnits += quantity;
      stockValueCents += quantity * v.costPriceCents;
      retailValueCents += quantity * v.sellingPriceCents;
      byStatus[status] += 1;

      const categoryName = v.product.category.name;
      const c = byCategory.get(categoryName) ?? { units: 0, valueCents: 0 };
      byCategory.set(categoryName, {
        units: c.units + quantity,
        valueCents: c.valueCents + quantity * v.costPriceCents,
      });

      return {
        variantId: v.id,
        sku: v.sku,
        productName: v.product.name,
        category: categoryName,
        color: v.color,
        size: v.size,
        quantity,
        minimumStock: v.minimumStock,
        status,
        costPrice: toMajor(v.costPriceCents),
        sellingPrice: toMajor(v.sellingPriceCents),
        stockValue: toMajor(quantity * v.costPriceCents),
      };
    });

    return {
      totals: {
        variants: variants.length,
        totalUnits,
        stockValueAtCost: toMajor(stockValueCents),
        stockValueAtRetail: toMajor(retailValueCents),
        potentialProfit: toMajor(retailValueCents - stockValueCents),
      },
      byStatus,
      byCategory: [...byCategory.entries()].map(([category, v]) => ({
        category,
        units: v.units,
        stockValue: toMajor(v.valueCents),
      })),
      items: rows,
    };
  },

  /** Best/worst sellers over a period, with per-variant profit. */
  async productsReport(input: RangeInput & { limit?: number } = {}) {
    const range = resolveDateRange(input);
    const limit = Math.min(input.limit ?? 20, 100);

    const items = await prisma.orderItem.findMany({
      where: {
        order: { createdAt: { gte: range.from, lte: range.to }, status: { notIn: NON_REVENUE_STATUSES } },
      },
      select: {
        variantId: true,
        quantity: true,
        totalCents: true,
        productName: true,
        variantSku: true,
        color: true,
        size: true,
        variant: { select: { costPriceCents: true, productId: true } },
      },
    });

    const byVariant = new Map<
      number,
      {
        variantId: number;
        productId: number;
        productName: string;
        sku: string;
        color: string;
        size: string;
        unitsSold: number;
        revenueCents: number;
        costCents: number;
      }
    >();

    for (const item of items) {
      const current = byVariant.get(item.variantId) ?? {
        variantId: item.variantId,
        productId: item.variant.productId,
        productName: item.productName,
        sku: item.variantSku,
        color: item.color,
        size: item.size,
        unitsSold: 0,
        revenueCents: 0,
        costCents: 0,
      };
      current.unitsSold += item.quantity;
      current.revenueCents += item.totalCents;
      current.costCents += item.quantity * item.variant.costPriceCents;
      byVariant.set(item.variantId, current);
    }

    const ranked = [...byVariant.values()]
      .map((v) => ({
        variantId: v.variantId,
        productId: v.productId,
        productName: v.productName,
        sku: v.sku,
        color: v.color,
        size: v.size,
        unitsSold: v.unitsSold,
        revenue: toMajor(v.revenueCents),
        cost: toMajor(v.costCents),
        profit: toMajor(v.revenueCents - v.costCents),
      }))
      .sort((a, b) => b.unitsSold - a.unitsSold);

    return {
      range: { from: range.from, to: range.to },
      topSellers: ranked.slice(0, limit),
      slowMovers: [...ranked].reverse().slice(0, limit),
      distinctVariantsSold: ranked.length,
    };
  },

  async purchasesReport(input: RangeInput = {}) {
    const range = resolveDateRange(input);
    const purchases = await prisma.purchase.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      include: {
        supplier: { select: { id: true, name: true } },
        items: { select: { quantity: true } },
      },
      orderBy: { id: 'desc' },
    });

    const bySupplier = new Map<string, { purchases: number; costCents: number; units: number }>();
    let receivedCostCents = 0;
    let receivedUnits = 0;

    for (const p of purchases) {
      const units = p.items.reduce((n, i) => n + i.quantity, 0);
      if (p.status === 'RECEIVED') {
        receivedCostCents += p.totalCostCents;
        receivedUnits += units;
      }
      const s = bySupplier.get(p.supplier.name) ?? { purchases: 0, costCents: 0, units: 0 };
      bySupplier.set(p.supplier.name, {
        purchases: s.purchases + 1,
        costCents: s.costCents + p.totalCostCents,
        units: s.units + units,
      });
    }

    return {
      range: { from: range.from, to: range.to },
      totals: {
        purchases: purchases.length,
        received: purchases.filter((p) => p.status === 'RECEIVED').length,
        draft: purchases.filter((p) => p.status === 'DRAFT').length,
        cancelled: purchases.filter((p) => p.status === 'CANCELLED').length,
        unitsReceived: receivedUnits,
        costReceived: toMajor(receivedCostCents),
      },
      bySupplier: [...bySupplier.entries()].map(([supplier, v]) => ({
        supplier,
        purchases: v.purchases,
        units: v.units,
        cost: toMajor(v.costCents),
      })),
    };
  },

  async returnsReport(input: RangeInput = {}) {
    const range = resolveDateRange(input);
    const rows = await prisma.return.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      include: {
        variant: { select: { sku: true, product: { select: { name: true } } } },
      },
    });

    const byReason = new Map<string, number>();
    const byVariant = new Map<string, { sku: string; productName: string; units: number }>();
    let acceptedUnits = 0;
    let refundCents = 0;

    for (const r of rows) {
      const reason = r.reason ?? 'UNSPECIFIED';
      byReason.set(reason, (byReason.get(reason) ?? 0) + r.quantity);
      if (r.status === 'ACCEPTED') {
        acceptedUnits += r.quantity;
        refundCents += r.refundCents;
      }
      const key = r.variant.sku;
      const v = byVariant.get(key) ?? { sku: key, productName: r.variant.product.name, units: 0 };
      v.units += r.quantity;
      byVariant.set(key, v);
    }

    return {
      range: { from: range.from, to: range.to },
      totals: {
        returns: rows.length,
        accepted: rows.filter((r) => r.status === 'ACCEPTED').length,
        requested: rows.filter((r) => r.status === 'REQUESTED').length,
        rejected: rows.filter((r) => r.status === 'REJECTED').length,
        unitsReturned: acceptedUnits,
        refundValue: toMajor(refundCents),
      },
      byReason: [...byReason.entries()].map(([reason, units]) => ({ reason, units })),
      topReturnedVariants: [...byVariant.values()].sort((a, b) => b.units - a.units).slice(0, 10),
    };
  },

  /** Revenue minus cost of goods sold, per day, over the period. */
  async profitReport(input: RangeInput = {}) {
    const range = resolveDateRange(input);
    const items = await prisma.orderItem.findMany({
      where: {
        order: { createdAt: { gte: range.from, lte: range.to }, status: { notIn: NON_REVENUE_STATUSES } },
      },
      select: {
        quantity: true,
        totalCents: true,
        order: { select: { createdAt: true, discountCents: true, id: true } },
        variant: { select: { costPriceCents: true } },
      },
    });

    const byDay = new Map<string, { revenueCents: number; costCents: number; units: number }>();
    let revenueCents = 0;
    let costCents = 0;
    let units = 0;

    for (const item of items) {
      const day = item.order.createdAt.toISOString().slice(0, 10);
      const itemCost = item.quantity * item.variant.costPriceCents;
      revenueCents += item.totalCents;
      costCents += itemCost;
      units += item.quantity;
      const d = byDay.get(day) ?? { revenueCents: 0, costCents: 0, units: 0 };
      byDay.set(day, {
        revenueCents: d.revenueCents + item.totalCents,
        costCents: d.costCents + itemCost,
        units: d.units + item.quantity,
      });
    }

    const marginPct = revenueCents > 0 ? ((revenueCents - costCents) / revenueCents) * 100 : 0;

    return {
      range: { from: range.from, to: range.to },
      totals: {
        unitsSold: units,
        revenue: toMajor(revenueCents),
        costOfGoods: toMajor(costCents),
        profit: toMajor(revenueCents - costCents),
        marginPercent: Math.round(marginPct * 100) / 100,
      },
      byDay: [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({
          date,
          units: v.units,
          revenue: toMajor(v.revenueCents),
          cost: toMajor(v.costCents),
          profit: toMajor(v.revenueCents - v.costCents),
        })),
    };
  },
};
