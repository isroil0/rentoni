import { api } from '@/lib/apiClient';
import type { Cart } from './types';

/**
 * Server-side cart for signed-in customers. Prices, line totals and purchasability are
 * all recomputed by the backend on every read, so the cart can never drift from reality.
 */
export const CartApi = {
  get: () => api.get<Cart>('/customer/cart'),
  addItem: (variantId: number, quantity: number) =>
    api.post<Cart>('/customer/cart/items', { variantId, quantity }),
  setQuantity: (variantId: number, quantity: number) =>
    api.patch<Cart>(`/customer/cart/items/${variantId}`, { quantity }),
  removeItem: (variantId: number) => api.delete<Cart>(`/customer/cart/items/${variantId}`),
  clear: () => api.delete<Cart>('/customer/cart'),
};
