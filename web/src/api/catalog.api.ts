import { api } from '@/lib/apiClient';
import type { Category, CustomerProduct, ProductQuery } from './types';

/** Public storefront catalogue. Responses never contain cost price or supplier data. */
export const CatalogApi = {
  listProducts: (query: ProductQuery = {}, signal?: AbortSignal) =>
    api.list<CustomerProduct>('/products', query, signal),

  getProduct: (id: number, signal?: AbortSignal) => api.get<CustomerProduct>(`/products/${id}`, undefined, signal),

  listCategories: (signal?: AbortSignal) => api.get<Category[]>('/categories', undefined, signal),
};
