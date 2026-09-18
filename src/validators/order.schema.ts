import { z } from 'zod';
import { dateRangeQuery, money, paginationQuery, positiveInt } from './common';
import { ORDER_SOURCES, ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES } from '../config/constants';

/**
 * An order line identifies a variant by id, SKU or barcode and carries a quantity.
 * Prices and totals are never accepted from the client — the server always prices
 * the line from the database.
 */
export const orderLineSchema = z
  .object({
    variantId: positiveInt.optional(),
    sku: z.string().trim().max(64).optional(),
    barcode: z.string().trim().max(64).optional(),
    quantity: positiveInt,
    discount: money.optional(),
  })
  .strict()
  .refine(
    (v) => Boolean(v.variantId || v.sku || v.barcode),
    'Each line needs one of variantId, sku or barcode',
  );

const discountFields = {
  discount: money.optional(),
  discountPercent: z.coerce.number().min(0).max(100).optional(),
};

export const posOrderCreateSchema = z
  .object({
    items: z.array(orderLineSchema).min(1).max(200),
    ...discountFields,
    customerId: positiveInt.nullish(),
    customerName: z.string().trim().max(120).nullish(),
    customerPhone: z.string().trim().max(30).nullish(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    note: z.string().trim().max(500).optional(),
    /** Create and complete the sale in a single transaction (normal counter flow). */
    completeNow: z.boolean().optional(),
  })
  .strict()
  .refine(
    (v) => v.discount === undefined || v.discountPercent === undefined,
    'Provide either "discount" or "discountPercent", not both',
  );

export const posQuoteSchema = z
  .object({ items: z.array(orderLineSchema).min(1).max(200), ...discountFields })
  .strict();

export const posCompleteSchema = z
  .object({
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export const cancelSchema = z.object({ reason: z.string().trim().max(500).optional() }).strict();

export const posSearchQuery = z
  .object({ q: z.string().trim().min(1).max(100), limit: z.coerce.number().int().min(1).max(50).optional() })
  .strict();

export const orderListQuery = paginationQuery
  .merge(dateRangeQuery)
  .extend({
    status: z.enum(ORDER_STATUSES).optional(),
    source: z.enum(ORDER_SOURCES).optional(),
    paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
    customerId: positiveInt.optional(),
    search: z.string().trim().max(100).optional(),
  })
  .strict();

export const orderStatusSchema = z
  .object({
    status: z.enum(ORDER_STATUSES),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

/** Customer checkout: no prices, no discounts, no customerId — all derived server-side. */
export const customerOrderCreateSchema = z
  .object({
    items: z
      .array(
        z
          .object({ variantId: positiveInt, quantity: positiveInt.max(1000) })
          .strict(),
      )
      .max(100)
      .optional(),
    fromCart: z.boolean().optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    note: z.string().trim().max(500).optional(),
    shippingPhone: z.string().trim().max(30).optional(),
  })
  .strict()
  .refine(
    (v) => Boolean(v.fromCart) !== Boolean(v.items?.length),
    'Provide either "items" or "fromCart: true"',
  );

export const customerOrderListQuery = paginationQuery
  .extend({ status: z.enum(ORDER_STATUSES).optional() })
  .strict();

export const cartAddSchema = z
  .object({ variantId: positiveInt, quantity: positiveInt.max(1000) })
  .strict();

export const cartUpdateSchema = z.object({ quantity: z.coerce.number().int().min(0).max(1000) }).strict();
export const cartItemParams = z.object({ variantId: positiveInt });
