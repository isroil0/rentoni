import { z } from 'zod';
import {
  boolParam,
  dateRangeQuery,
  paginationQuery,
  positiveInt,
  nonNegativeInt,
} from './common';
import { INVENTORY_TRANSACTION_TYPES, REFERENCE_TYPES } from '../config/constants';

export const inventoryListQuery = paginationQuery
  .extend({
    search: z.string().trim().max(100).optional(),
    categoryId: positiveInt.optional(),
    productId: positiveInt.optional(),
    status: z.enum(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']).optional(),
    active: boolParam.optional(),
  })
  .strict();

/**
 * An adjustment is either relative (`quantity` with a direction implied by `type`) or
 * absolute (`setQuantity`). Exactly one of the two must be supplied.
 */
export const inventoryAdjustSchema = z
  .object({
    variantId: positiveInt,
    type: z.enum(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE']).optional(),
    quantity: positiveInt.optional(),
    setQuantity: nonNegativeInt.optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine(
    (v) => (v.quantity === undefined) !== (v.setQuantity === undefined),
    'Provide exactly one of "quantity" (relative) or "setQuantity" (absolute)',
  )
  .refine(
    (v) => v.setQuantity !== undefined || v.type !== undefined,
    'A relative adjustment requires "type"',
  );

export const inventoryTransactionsQuery = paginationQuery
  .merge(dateRangeQuery)
  .extend({
    variantId: positiveInt.optional(),
    type: z.enum(INVENTORY_TRANSACTION_TYPES).optional(),
    referenceType: z.enum(REFERENCE_TYPES).optional(),
    referenceId: positiveInt.optional(),
    userId: positiveInt.optional(),
  })
  .strict();

export const lowStockQuery = paginationQuery
  .extend({ includeOutOfStock: boolParam.optional() })
  .strict();
