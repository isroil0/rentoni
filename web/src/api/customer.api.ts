import { api } from '@/lib/apiClient';
import type { Order, PaymentMethod, ReturnEligibility, ReturnRecord, User } from './types';

export interface PlaceOrderInput {
  items?: { variantId: number; quantity: number }[];
  fromCart?: boolean;
  paymentMethod?: PaymentMethod;
  note?: string;
  shippingPhone?: string;
}

/**
 * Customer self-service. Every endpoint is scoped to the authenticated user by the
 * backend, so there is no customer id to pass — and none to tamper with.
 */
export const CustomerApi = {
  getProfile: () => api.get<User>('/customer/profile'),
  updateProfile: (input: { name?: string; phone?: string | null; email?: string }) =>
    api.put<User>('/customer/profile', input),

  /**
   * Sends only variant ids and quantities. Price, subtotal, discount, total and stock
   * are all determined by the backend.
   */
  placeOrder: (input: PlaceOrderInput) => api.post<Order>('/customer/orders', input),

  listOrders: (query: { page?: number; limit?: number; status?: string } = {}) =>
    api.list<Order>('/customer/orders', query),
  getOrder: (id: number) => api.get<Order>(`/customer/orders/${id}`),
  cancelOrder: (id: number, reason?: string) =>
    api.post<Order>(`/customer/orders/${id}/cancel`, reason ? { reason } : {}),

  returnEligibility: (orderId: number) =>
    api.get<ReturnEligibility>(`/customer/orders/${orderId}/return-eligibility`),

  requestReturn: (input: {
    orderId: number;
    items: { variantId: number; quantity: number; reason?: string }[];
    reason?: string;
  }) => api.post<ReturnRecord[]>('/customer/returns', input),

  listReturns: (query: { page?: number; limit?: number; status?: string } = {}) =>
    api.list<ReturnRecord>('/customer/returns', query),
};
