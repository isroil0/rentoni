/**
 * Types mirroring the actual backend responses (captured from the running API, not
 * guessed). Anything the backend deliberately withholds from customers — cost price,
 * margin, supplier, inventory transactions — is absent from the customer-facing types
 * by construction.
 */

export type Role = 'SUPER_ADMIN' | 'CUSTOMER';
export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
export type OrderSource = 'POS' | 'ONLINE';
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PAID' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
export type PaymentStatus = 'UNPAID' | 'PAID' | 'REFUNDED';
export type PaymentMethod = 'CASH' | 'CARD' | 'OTHER';
export type PurchaseStatus = 'DRAFT' | 'RECEIVED' | 'CANCELLED';
export type ReturnStatus = 'REQUESTED' | 'ACCEPTED' | 'REJECTED';
export type InventoryTransactionType =
  | 'PURCHASE'
  | 'SALE'
  | 'RETURN'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'DAMAGE';

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface ProductImage {
  id: number;
  url: string;
  altText: string | null;
  isPrimary: boolean;
  sortOrder: number;
}

export interface Category {
  id: number;
  name: string;
  description: string | null;
  productCount?: number;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// ---- customer-facing catalogue ----

export interface CustomerVariant {
  id: number;
  sku: string;
  color: string;
  size: string;
  price: number;
  availability: StockStatus;
  inStock: boolean;
  /** Only present when the store enables `customer.expose_exact_stock`. */
  quantity?: number;
}

export interface CustomerProduct {
  id: number;
  name: string;
  description: string | null;
  brand: string | null;
  category: { id: number; name: string } | null;
  images: ProductImage[];
  colors: string[];
  sizes: string[];
  priceFrom: number | null;
  priceTo: number | null;
  availability: StockStatus;
  variants: CustomerVariant[];
}

// ---- admin catalogue ----

export interface AdminVariant {
  id: number;
  productId: number;
  sku: string;
  barcode: string | null;
  color: string;
  size: string;
  costPrice: number;
  sellingPrice: number;
  marginPerUnit: number;
  minimumStock: number;
  active: boolean;
  quantity: number;
  stockStatus: StockStatus;
  createdAt?: string;
  updatedAt?: string;
  product?: { id: number; name: string; brand: string | null };
}

export interface AdminProduct {
  id: number;
  categoryId: number | null;
  category: { id: number; name: string } | null;
  name: string;
  description: string | null;
  brand: string | null;
  active: boolean;
  images: ProductImage[];
  variants: AdminVariant[];
  variantCount: number;
  totalStock: number;
  createdAt?: string;
  updatedAt?: string;
}

// ---- cart ----

export interface CartItem {
  id: number;
  variantId: number;
  productId: number;
  productName: string;
  sku: string;
  color: string;
  size: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  available: boolean;
  purchasable: boolean;
}

export interface Cart {
  id: number;
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  readyForCheckout: boolean;
}

// ---- orders ----

export interface OrderItem {
  id: number;
  variantId: number;
  productName: string;
  sku: string;
  color: string;
  size: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

export interface Order {
  id: number;
  orderNumber: string;
  source: OrderSource;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  total: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  note: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  itemCount: number;
}

/** Admin projection carries staff/customer identity and the stock-commitment flag. */
export interface AdminOrder extends Order {
  customerId: number | null;
  customer: { id: number; name: string; email: string; phone: string | null } | null;
  customerName: string | null;
  customerPhone: string | null;
  createdById: number | null;
  createdBy: { id: number; name: string; email: string } | null;
  stockCommitted: boolean;
}

// ---- inventory ----

export interface InventoryRow {
  variantId: number;
  sku: string;
  barcode: string | null;
  color: string;
  size: string;
  active: boolean;
  product: { id: number; name: string; brand: string | null; categoryId: number | null };
  quantity: number;
  minimumStock: number;
  status: StockStatus;
  stockValueCents: number;
  updatedAt: string | null;
}

export interface InventoryDetail {
  variantId: number;
  sku: string;
  barcode: string | null;
  color: string;
  size: string;
  product: { id: number; name: string; brand: string | null };
  quantity: number;
  minimumStock: number;
  status: StockStatus;
  updatedAt: string | null;
}

export interface InventoryTransaction {
  id: number;
  variantId: number;
  type: InventoryTransactionType;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  referenceType: string | null;
  referenceId: number | null;
  userId: number | null;
  note: string | null;
  createdAt: string;
  variant: {
    id: number;
    sku: string;
    color: string;
    size: string;
    product: { id: number; name: string };
  };
  user: { id: number; name: string; email: string } | null;
}

export interface LowStockRow {
  variantId: number;
  sku: string;
  color: string;
  size: string;
  quantity: number;
  minimumStock: number;
  product: { id: number; name: string };
  status: StockStatus;
}

// ---- POS ----

export interface PosSearchResult {
  variantId: number;
  productId: number;
  productName: string;
  brand: string | null;
  sku: string;
  barcode: string | null;
  color: string;
  size: string;
  price: number;
  quantity: number;
  stockStatus: StockStatus;
}

export interface PosQuoteItem {
  variantId: number;
  sku: string;
  productName: string;
  color: string;
  size: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

export interface PosQuote {
  items: PosQuoteItem[];
  subtotal: number;
  discount: number;
  total: number;
  availability: { variantId: number; sku: string; requested: number; available: number; sufficient: boolean }[];
  canComplete: boolean;
}

export interface Receipt {
  orderNumber: string;
  date: string;
  status: OrderStatus;
  cashier: string | null;
  customer: string;
  items: {
    name: string;
    sku: string;
    color: string;
    size: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
}

// ---- suppliers & purchases ----

export interface Supplier {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
  purchaseCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseItem {
  id: number;
  variantId: number;
  sku: string;
  color: string;
  size: string;
  productName: string;
  quantity: number;
  unitCost: number;
  total: number;
}

export interface Purchase {
  id: number;
  purchaseNumber: string;
  supplierId: number;
  supplier: { id: number; name: string; phone: string | null; active: boolean };
  status: PurchaseStatus;
  totalCost: number;
  createdById: number | null;
  createdBy: { id: number; name: string; email: string } | null;
  note: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: PurchaseItem[];
  itemCount: number;
}

// ---- returns ----

export interface ReturnRecord {
  id: number;
  returnNumber: string;
  orderId: number;
  orderNumber: string;
  variantId: number;
  sku: string;
  productName: string;
  color: string;
  size: string;
  quantity: number;
  reason: string | null;
  status: ReturnStatus;
  refundAmount: number;
  createdById: number | null;
  createdBy: { id: number; name: string; email: string; role: Role } | null;
  processedAt: string | null;
  createdAt: string;
}

export interface ReturnEligibility {
  orderId: number;
  orderNumber: string;
  status: OrderStatus;
  returnable: boolean;
  lines: {
    variantId: number;
    sku: string;
    productName: string;
    color: string;
    size: string;
    ordered: number;
    alreadyReturned: number;
    eligible: number;
    unitPrice: number;
  }[];
}

// ---- customers ----

export interface CustomerSummary extends User {
  orderCount: number;
  totalSpent: number;
}

export interface CustomerDetail extends CustomerSummary {
  recentOrders: {
    id: number;
    orderNumber: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    total: number;
    createdAt: string;
  }[];
}

// ---- reports ----

export interface DashboardSummary {
  range: { from: string; to: string; preset: string };
  sales: {
    orders: number;
    revenue: number;
    grossSales: number;
    discounts: number;
    itemsSold: number;
    averageOrderValue: number;
    costOfGoods: number;
    profit: number;
  };
  inventory: {
    totalUnits: number;
    stockValue: number;
    activeVariants: number;
    lowStockVariants: number;
    outOfStockVariants: number;
  };
  customers: { total: number; active: number };
  operations: {
    pendingOrders: number;
    returns: number;
    unitsReturned: number;
    refundValue: number;
    purchasesReceived: number;
    purchaseCost: number;
  };
  recentOrders: {
    id: number;
    orderNumber: string;
    source: OrderSource;
    status: OrderStatus;
    total: number;
    createdAt: string;
  }[];
}

export interface SalesReport {
  range: { from: string; to: string };
  totals: {
    orders: number;
    grossSales: number;
    discounts: number;
    revenue: number;
    unitsSold: number;
    costOfGoods: number;
    profit: number;
    averageOrderValue: number;
  };
  byDay: { date: string; orders: number; revenue: number; units: number }[];
  bySource: { source: string; orders: number; revenue: number; units: number }[];
  byPaymentMethod: { method: string; orders: number; revenue: number }[];
}

export interface InventoryReport {
  totals: {
    variants: number;
    totalUnits: number;
    stockValueAtCost: number;
    stockValueAtRetail: number;
    potentialProfit: number;
  };
  byStatus: Record<StockStatus, number>;
  byCategory: { category: string; units: number; stockValue: number }[];
  items: {
    variantId: number;
    sku: string;
    productName: string;
    category: string;
    color: string;
    size: string;
    quantity: number;
    minimumStock: number;
    status: StockStatus;
    costPrice: number;
    sellingPrice: number;
    stockValue: number;
  }[];
}

export interface ProductsReport {
  range: { from: string; to: string };
  topSellers: ProductsReportRow[];
  slowMovers: ProductsReportRow[];
  distinctVariantsSold: number;
}

export interface ProductsReportRow {
  variantId: number;
  productId: number;
  productName: string;
  sku: string;
  color: string;
  size: string;
  unitsSold: number;
  revenue: number;
  cost: number;
  profit: number;
}

export interface PurchasesReport {
  range: { from: string; to: string };
  totals: {
    purchases: number;
    received: number;
    draft: number;
    cancelled: number;
    unitsReceived: number;
    costReceived: number;
  };
  bySupplier: { supplier: string; purchases: number; units: number; cost: number }[];
}

export interface ReturnsReport {
  range: { from: string; to: string };
  totals: {
    returns: number;
    accepted: number;
    requested: number;
    rejected: number;
    unitsReturned: number;
    refundValue: number;
  };
  byReason: { reason: string; units: number }[];
  topReturnedVariants: { sku: string; productName: string; units: number }[];
}

export interface ProfitReport {
  range: { from: string; to: string };
  totals: {
    unitsSold: number;
    revenue: number;
    costOfGoods: number;
    profit: number;
    marginPercent: number;
  };
  byDay: { date: string; units: number; revenue: number; cost: number; profit: number }[];
}

// ---- system ----

export interface AuditLogEntry {
  id: number;
  userId: number | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValue: string | null;
  newValue: string | null;
  ip: string | null;
  createdAt: string;
  user: { id: number; name: string; email: string; role: Role } | null;
}

export type Settings = Record<string, string>;

export interface ProductQuery {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: number;
  brand?: string;
  color?: string;
  size?: string;
  sku?: string;
  barcode?: string;
  minPrice?: number;
  maxPrice?: number;
  availability?: StockStatus;
  active?: boolean;
  sort?: 'newest' | 'oldest' | 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc';
}
