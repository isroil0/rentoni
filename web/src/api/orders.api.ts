import { api } from '@/lib/apiClient';
import type { AdminOrder, OrderSource, OrderStatus, PaymentMethod, PaymentStatus } from './types';

export interface OrderQuery {
  page?: number;
  limit?: number;
  status?: OrderStatus;
  source?: OrderSource;
  paymentStatus?: PaymentStatus;
  customerId?: number;
  search?: string;
  from?: string;
  to?: string;
}

/** Admin "Sales": every order, POS and online alike. */
export const OrdersApi = {
  list: (query: OrderQuery = {}) => api.list<AdminOrder>('/admin/orders', query),
  get: (id: number) => api.get<AdminOrder>(`/admin/orders/${id}`),
  cancel: (id: number, reason?: string) =>
    api.post<AdminOrder>(`/admin/orders/${id}/cancel`, reason ? { reason } : {}),
  updateStatus: (id: number, status: OrderStatus, extra: { paymentMethod?: PaymentMethod; reason?: string } = {}) =>
    api.post<AdminOrder>(`/admin/orders/${id}/status`, { status, ...extra }),
};
