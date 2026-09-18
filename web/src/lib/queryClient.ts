import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './apiClient';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Inventory and order data changes often; keep it fresh but not chatty.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry(failureCount, error) {
        // Never retry a deterministic rejection — only transient network/server faults.
        if (error instanceof ApiError) {
          if (error.status === 0) return failureCount < 2;
          if (error.status >= 500 || error.code === 'SERVICE_BUSY') return failureCount < 2;
          return false;
        }
        return false;
      },
    },
    mutations: { retry: false },
  },
});

/** Query keys in one place so invalidation after a mutation is never guesswork. */
export const qk = {
  catalog: {
    products: (query: unknown) => ['catalog', 'products', query] as const,
    product: (id: number) => ['catalog', 'product', id] as const,
    categories: () => ['catalog', 'categories'] as const,
  },
  cart: () => ['cart'] as const,
  customer: {
    profile: () => ['customer', 'profile'] as const,
    orders: (query: unknown) => ['customer', 'orders', query] as const,
    order: (id: number) => ['customer', 'order', id] as const,
    returns: (query: unknown) => ['customer', 'returns', query] as const,
    eligibility: (orderId: number) => ['customer', 'eligibility', orderId] as const,
  },
  admin: {
    dashboard: (range: unknown) => ['admin', 'dashboard', range] as const,
    products: (query: unknown) => ['admin', 'products', query] as const,
    product: (id: number) => ['admin', 'product', id] as const,
    categories: (query: unknown) => ['admin', 'categories', query] as const,
    variants: (query: unknown) => ['admin', 'variants', query] as const,
    inventory: (query: unknown) => ['admin', 'inventory', query] as const,
    inventoryVariant: (id: number) => ['admin', 'inventory', 'variant', id] as const,
    transactions: (query: unknown) => ['admin', 'transactions', query] as const,
    lowStock: (query: unknown) => ['admin', 'lowStock', query] as const,
    orders: (query: unknown) => ['admin', 'orders', query] as const,
    order: (id: number) => ['admin', 'order', id] as const,
    purchases: (query: unknown) => ['admin', 'purchases', query] as const,
    purchase: (id: number) => ['admin', 'purchase', id] as const,
    suppliers: (query: unknown) => ['admin', 'suppliers', query] as const,
    returns: (query: unknown) => ['admin', 'returns', query] as const,
    returnEligibility: (orderId: number) => ['admin', 'returnEligibility', orderId] as const,
    customers: (query: unknown) => ['admin', 'customers', query] as const,
    customer: (id: number) => ['admin', 'customer', id] as const,
    reports: (kind: string, range: unknown) => ['admin', 'reports', kind, range] as const,
    auditLogs: (query: unknown) => ['admin', 'auditLogs', query] as const,
    settings: () => ['admin', 'settings'] as const,
    posSearch: (q: string) => ['admin', 'posSearch', q] as const,
  },
} as const;
