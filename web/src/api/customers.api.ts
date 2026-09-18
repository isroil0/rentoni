import { api } from '@/lib/apiClient';
import type { CustomerDetail, CustomerSummary } from './types';

export const CustomersApi = {
  list: (query: { page?: number; limit?: number; search?: string; active?: boolean } = {}) =>
    api.list<CustomerSummary>('/admin/customers', query),
  get: (id: number) => api.get<CustomerDetail>(`/admin/customers/${id}`),
  setStatus: (id: number, active: boolean) =>
    api.patch<CustomerSummary>(`/admin/customers/${id}/status`, { active }),
};
