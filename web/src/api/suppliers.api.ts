import { api } from '@/lib/apiClient';
import type { Supplier } from './types';

export const SuppliersApi = {
  list: (query: { page?: number; limit?: number; search?: string; active?: boolean } = {}) =>
    api.list<Supplier>('/admin/suppliers', query),
  get: (id: number) => api.get<Supplier>(`/admin/suppliers/${id}`),
  create: (input: {
    name: string;
    phone?: string | null;
    address?: string | null;
    notes?: string | null;
    active?: boolean;
  }) => api.post<Supplier>('/admin/suppliers', input),
  update: (
    id: number,
    input: { name?: string; phone?: string | null; address?: string | null; notes?: string | null; active?: boolean },
  ) => api.put<Supplier>(`/admin/suppliers/${id}`, input),
  remove: (id: number, hard = false) =>
    api.delete<{ id: number; deleted: boolean; deactivated: boolean }>(
      `/admin/suppliers/${id}`,
      hard ? { hard: true } : undefined,
    ),
};
