import { api } from '@/lib/apiClient';
import type { AdminOrder, PaymentMethod, PosQuote, PosSearchResult, Receipt } from './types';

export interface PosLine {
  variantId?: number;
  sku?: string;
  barcode?: string;
  quantity: number;
  discount?: number;
}

/**
 * POS is a SUPER_ADMIN feature, not a role. Totals always come from the backend:
 * `quote` prices the on-screen cart without writing, and `createOrder` re-prices
 * everything server-side when the sale is committed.
 */
export const PosApi = {
  search: (q: string, limit = 24) => api.get<PosSearchResult[]>('/admin/pos/search', { q, limit }),

  quote: (items: PosLine[], discount?: { discount?: number; discountPercent?: number }) =>
    api.post<PosQuote>('/admin/pos/quote', { items, ...discount }),

  /** `completeNow` performs the sale and the stock deduction in one transaction. */
  createOrder: (input: {
    items: PosLine[];
    discount?: number;
    discountPercent?: number;
    customerId?: number | null;
    customerName?: string | null;
    customerPhone?: string | null;
    paymentMethod?: PaymentMethod;
    note?: string;
    completeNow?: boolean;
  }) => api.post<AdminOrder>('/admin/pos/orders', input),

  complete: (id: number, input: { paymentMethod?: PaymentMethod; note?: string } = {}) =>
    api.post<AdminOrder>(`/admin/pos/orders/${id}/complete`, input),

  cancel: (id: number, reason?: string) =>
    api.post<AdminOrder>(`/admin/pos/orders/${id}/cancel`, reason ? { reason } : {}),

  receipt: (id: number) => api.get<Receipt>(`/admin/pos/orders/${id}/receipt`),
};
