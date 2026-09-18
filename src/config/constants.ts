/**
 * Enum-like unions. SQLite has no ENUM type, so these are the single source of truth
 * in application code and are mirrored by CHECK constraints in the initial migration.
 */

export const ROLES = ['SUPER_ADMIN', 'CUSTOMER'] as const;
export type Role = (typeof ROLES)[number];

export const INVENTORY_TRANSACTION_TYPES = [
  'PURCHASE',
  'SALE',
  'RETURN',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'DAMAGE',
] as const;
export type InventoryTransactionType = (typeof INVENTORY_TRANSACTION_TYPES)[number];

/** Types that add stock. Everything else removes stock. */
export const INBOUND_TRANSACTION_TYPES: InventoryTransactionType[] = [
  'PURCHASE',
  'RETURN',
  'ADJUSTMENT_IN',
];

export const REFERENCE_TYPES = [
  'PURCHASE',
  'ORDER',
  'RETURN',
  'ORDER_CANCELLATION',
  'MANUAL',
] as const;
export type ReferenceType = (typeof REFERENCE_TYPES)[number];

export const ORDER_SOURCES = ['POS', 'ONLINE'] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PAID',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Allowed order status transitions. Anything not listed here is rejected with
 * INVALID_STATUS_TRANSITION.
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'PAID', 'COMPLETED', 'CANCELLED'],
  CONFIRMED: ['PAID', 'COMPLETED', 'CANCELLED'],
  PAID: ['COMPLETED', 'CANCELLED', 'REFUNDED'],
  // COMPLETED -> CANCELLED is the "void the sale" path a POS needs for a mis-rung
  // ticket. It restores stock, and is blocked once returns exist against the order.
  COMPLETED: ['REFUNDED', 'CANCELLED'],
  CANCELLED: [],
  REFUNDED: [],
};

/** Statuses after which no further stock movement or mutation is possible. */
export const TERMINAL_ORDER_STATUSES: OrderStatus[] = ['CANCELLED', 'REFUNDED'];

/** Orders in these states still hold committed stock and may be cancelled/voided. */
export const CANCELLABLE_ORDER_STATUSES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PAID',
  'COMPLETED',
];

/** Only fulfilled orders can be returned against. */
export const RETURNABLE_ORDER_STATUSES: OrderStatus[] = ['PAID', 'COMPLETED'];

export const PAYMENT_STATUSES = ['UNPAID', 'PAID', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ['CASH', 'CARD', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PURCHASE_STATUSES = ['DRAFT', 'RECEIVED', 'CANCELLED'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const RETURN_STATUSES = ['REQUESTED', 'ACCEPTED', 'REJECTED'] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const STOCK_STATUSES = ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export const SETTING_KEYS = {
  /** When "true", customer-facing product APIs include exact stock numbers. */
  EXPOSE_EXACT_STOCK: 'customer.expose_exact_stock',
  STORE_NAME: 'store.name',
  CURRENCY: 'store.currency',
  /** Hours after creation during which a customer may still cancel their own order. */
  CUSTOMER_CANCEL_WINDOW_HOURS: 'orders.customer_cancel_window_hours',
  /** Days after an order during which a customer may request a return. */
  CUSTOMER_RETURN_WINDOW_DAYS: 'orders.customer_return_window_days',
} as const;

export const SEQUENCE_KEYS = {
  ORDER_ONLINE: 'order_online',
  ORDER_POS: 'order_pos',
  PURCHASE: 'purchase',
  RETURN: 'return',
} as const;

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;
