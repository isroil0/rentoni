import { api } from '@/lib/apiClient';
import type {
  DashboardSummary,
  InventoryReport,
  ProductsReport,
  ProfitReport,
  PurchasesReport,
  ReturnsReport,
  SalesReport,
} from './types';

export type RangePreset = 'today' | 'week' | 'month' | 'year';

export interface RangeQuery {
  preset?: RangePreset;
  from?: string;
  to?: string;
}

/**
 * Every figure here — including profit — is computed by the backend. The frontend
 * only renders it; it never recalculates business-critical numbers.
 */
export const ReportsApi = {
  dashboard: (range: RangeQuery = { preset: 'today' }) =>
    api.get<DashboardSummary>('/admin/dashboard/summary', range),
  sales: (range: RangeQuery = {}, source?: string) =>
    api.get<SalesReport>('/admin/reports/sales', { ...range, source }),
  inventory: () => api.get<InventoryReport>('/admin/reports/inventory'),
  products: (range: RangeQuery = {}, limit?: number) =>
    api.get<ProductsReport>('/admin/reports/products', { ...range, limit }),
  purchases: (range: RangeQuery = {}) => api.get<PurchasesReport>('/admin/reports/purchases', range),
  returns: (range: RangeQuery = {}) => api.get<ReturnsReport>('/admin/reports/returns', range),
  profit: (range: RangeQuery = {}) => api.get<ProfitReport>('/admin/reports/profit', range),
};
