import { api } from '@/lib/apiClient';
import type { ReturnEligibility, ReturnRecord, ReturnStatus } from './types';

export const ReturnsApi = {
  list: (
    query: {
      page?: number;
      limit?: number;
      orderId?: number;
      variantId?: number;
      status?: ReturnStatus;
      customerId?: number;
      from?: string;
      to?: string;
    } = {},
  ) => api.list<ReturnRecord>('/admin/returns', query),

  get: (id: number) => api.get<ReturnRecord>(`/admin/returns/${id}`),

  /** Backend validates the eligible quantity; the UI only pre-fills the maximum. */
  eligibility: (orderId: number) => api.get<ReturnEligibility>(`/admin/returns/eligibility/${orderId}`),

  create: (input: {
    orderId: number;
    items: { variantId: number; quantity: number; reason?: string }[];
    reason?: string;
    autoAccept?: boolean;
  }) => api.post<ReturnRecord[]>('/admin/returns', input),

  accept: (id: number, note?: string) => api.post<ReturnRecord>(`/admin/returns/${id}/accept`, note ? { note } : {}),
  reject: (id: number, reason?: string) =>
    api.post<ReturnRecord>(`/admin/returns/${id}/reject`, reason ? { reason } : {}),
};
