import { api } from '@/lib/apiClient';
import type { InventoryDetail, InventoryRow, InventoryTransaction, LowStockRow, StockStatus } from './types';

export interface AdjustInput {
  variantId: number;
  /** Relative adjustment: requires `type`. */
  type?: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'DAMAGE';
  quantity?: number;
  /** Absolute target; mutually exclusive with `quantity`. */
  setQuantity?: number;
  note?: string;
}

/**
 * All stock movement goes through the backend inventory service — the UI only ever
 * requests an adjustment and renders the resulting transaction.
 */
export const InventoryApi = {
  list: (
    query: {
      page?: number;
      limit?: number;
      search?: string;
      categoryId?: number;
      productId?: number;
      status?: StockStatus;
      active?: boolean;
    } = {},
  ) => api.list<InventoryRow>('/admin/inventory', query),

  getByVariant: (variantId: number) => api.get<InventoryDetail>(`/admin/inventory/${variantId}`),

  lowStock: (query: { page?: number; limit?: number } = {}) =>
    api.list<LowStockRow>('/admin/inventory/low-stock', query),

  outOfStock: (query: { page?: number; limit?: number } = {}) =>
    api.list<LowStockRow>('/admin/inventory/out-of-stock', query),

  transactions: (
    query: {
      page?: number;
      limit?: number;
      variantId?: number;
      type?: string;
      referenceType?: string;
      referenceId?: number;
      from?: string;
      to?: string;
    } = {},
  ) => api.list<InventoryTransaction>('/admin/inventory/transactions', query),

  adjust: (input: AdjustInput) =>
    api.post<{
      variantId: number;
      sku: string;
      previousQuantity: number;
      quantity: number;
      minimumStock: number;
      status: StockStatus;
    }>('/admin/inventory/adjust', input),
};
