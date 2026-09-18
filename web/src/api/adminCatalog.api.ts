import { api } from '@/lib/apiClient';
import type { AdminProduct, AdminVariant, Category, ProductImage, ProductQuery } from './types';

export interface VariantInput {
  sku: string;
  barcode?: string | null;
  color: string;
  size: string;
  costPrice: number;
  sellingPrice: number;
  minimumStock?: number;
  active?: boolean;
  initialStock?: number;
}

export interface ProductInput {
  categoryId: number;
  name: string;
  description?: string | null;
  brand?: string | null;
  active?: boolean;
  images?: { url: string; altText?: string | null; sortOrder?: number; isPrimary?: boolean }[];
  variants?: VariantInput[];
}

export const AdminCatalogApi = {
  // categories
  listCategories: (query: { page?: number; limit?: number; search?: string; active?: boolean } = {}) =>
    api.list<Category>('/admin/categories', query),
  createCategory: (input: { name: string; description?: string | null; active?: boolean }) =>
    api.post<Category>('/admin/categories', input),
  updateCategory: (id: number, input: { name?: string; description?: string | null; active?: boolean }) =>
    api.put<Category>(`/admin/categories/${id}`, input),
  deleteCategory: (id: number, hard = false) =>
    api.delete<{ id: number }>(`/admin/categories/${id}`, hard ? { hard: true } : undefined),

  // products
  listProducts: (query: ProductQuery = {}) => api.list<AdminProduct>('/admin/products', query),
  getProduct: (id: number) => api.get<AdminProduct>(`/admin/products/${id}`),
  createProduct: (input: ProductInput) => api.post<AdminProduct>('/admin/products', input),
  updateProduct: (id: number, input: Partial<Omit<ProductInput, 'images' | 'variants'>>) =>
    api.put<AdminProduct>(`/admin/products/${id}`, input),
  deleteProduct: (id: number, hard = false) =>
    api.delete<{ id: number; deleted: boolean; deactivated: boolean }>(
      `/admin/products/${id}`,
      hard ? { hard: true } : undefined,
    ),

  // images
  addImages: (
    productId: number,
    images: { url: string; altText?: string | null; sortOrder?: number; isPrimary?: boolean }[],
  ) => api.post<ProductImage[]>(`/admin/products/${productId}/images`, { images }),
  removeImage: (productId: number, imageId: number) =>
    api.delete<{ id: number }>(`/admin/products/${productId}/images/${imageId}`),
  setPrimaryImage: (productId: number, imageId: number) =>
    api.post<ProductImage>(`/admin/products/${productId}/images/${imageId}/primary`),

  // variants
  listVariants: (
    query: { page?: number; limit?: number; productId?: number; search?: string; color?: string; size?: string } = {},
  ) => api.list<AdminVariant>('/admin/variants', query),
  getVariant: (id: number) => api.get<AdminVariant>(`/admin/variants/${id}`),
  lookupVariant: (code: string) => api.get<AdminVariant>('/admin/variants/lookup', { code }),
  createVariant: (productId: number, input: VariantInput) =>
    api.post<AdminVariant>(`/admin/products/${productId}/variants`, input),
  updateVariant: (id: number, input: Partial<VariantInput>) =>
    api.put<AdminVariant>(`/admin/variants/${id}`, input),
  deleteVariant: (id: number, hard = false) =>
    api.delete<{ id: number }>(`/admin/variants/${id}`, hard ? { hard: true } : undefined),
};
