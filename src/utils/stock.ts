import type { StockStatus } from '../config/constants';

/**
 * Single definition of stock status, used by admin APIs, customer APIs and reports.
 *   quantity === 0            -> OUT_OF_STOCK
 *   quantity <= minimumStock  -> LOW_STOCK
 *   otherwise                 -> IN_STOCK
 */
export function stockStatus(quantity: number, minimumStock: number): StockStatus {
  if (quantity <= 0) return 'OUT_OF_STOCK';
  if (quantity <= minimumStock) return 'LOW_STOCK';
  return 'IN_STOCK';
}
