import { toMajor } from '../utils/money';

type OrderItemRow = {
  id: number;
  variantId: number;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  totalCents: number;
  productName: string;
  variantSku: string;
  color: string;
  size: string;
};

type OrderRow = {
  id: number;
  orderNumber: string;
  customerId: number | null;
  source: string;
  status: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  paymentStatus: string;
  paymentMethod: string | null;
  createdById: number | null;
  stockCommitted: boolean;
  customerName: string | null;
  customerPhone: string | null;
  note: string | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items?: OrderItemRow[];
  customer?: { id: number; name: string; email: string; phone: string | null } | null;
  createdBy?: { id: number; name: string; email: string } | null;
};

function baseItem(item: OrderItemRow) {
  return {
    id: item.id,
    variantId: item.variantId,
    productName: item.productName,
    sku: item.variantSku,
    color: item.color,
    size: item.size,
    quantity: item.quantity,
    unitPrice: toMajor(item.unitPriceCents),
    discount: toMajor(item.discountCents),
    total: toMajor(item.totalCents),
  };
}

function baseOrder(order: OrderRow) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    source: order.source,
    status: order.status,
    subtotal: toMajor(order.subtotalCents),
    discount: toMajor(order.discountCents),
    total: toMajor(order.totalCents),
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    note: order.note,
    completedAt: order.completedAt,
    cancelledAt: order.cancelledAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: (order.items ?? []).map(baseItem),
    itemCount: (order.items ?? []).reduce((n, i) => n + i.quantity, 0),
  };
}

export function adminOrder(order: OrderRow) {
  return {
    ...baseOrder(order),
    customerId: order.customerId,
    customer: order.customer ?? null,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    createdById: order.createdById,
    createdBy: order.createdBy ?? null,
    stockCommitted: order.stockCommitted,
  };
}

/** Customer projection: no internal flags, no staff identity, no other customers' data. */
export function customerOrder(order: OrderRow) {
  return baseOrder(order);
}
