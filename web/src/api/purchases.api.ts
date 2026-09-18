import { api } from '@/lib/apiClient';
import type { Purchase, PurchaseStatus } from './types';

export const PurchasesApi = {
  list: (
    query: {
      page?: number;
      limit?: number;
      status?: PurchaseStatus;
      supplierId?: number;
      search?: string;
      from?: string;
      to?: string;
    } = {},
  ) => api.list<Purchase>('/admin/purchases', query),

  get: (id: number) => api.get<Purchase>(`/admin/purchases/${id}`),

  create: (input: {
    supplierId: number;
    items: { variantId: number; quantity: number; unitCost: number }[];
    note?: string;
    receiveNow?: boolean;
  }) => api.post<Purchase>('/admin/purchases', input),

  /** Idempotent on the backend: a second call returns PURCHASE_ALREADY_RECEIVED. */
  receive: (id: number) => api.post<Purchase>(`/admin/purchases/${id}/receive`),

  cancel: (id: number, reason?: string) =>
    api.post<Purchase>(`/admin/purchases/${id}/cancel`, reason ? { reason } : {}),
};
