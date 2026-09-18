import { z } from 'zod';
import {
  boolParam,
  dateRangeQuery,
  money,
  paginationQuery,
  positiveInt,
  trimmedString,
} from './common';
import { PURCHASE_STATUSES, RETURN_STATUSES } from '../config/constants';

// ---- suppliers ------------------------------------------------------------

export const supplierCreateSchema = z
  .object({
    name: trimmedString(2, 150),
    phone: z.string().trim().max(30).nullish(),
    address: z.string().trim().max(300).nullish(),
    notes: z.string().trim().max(1000).nullish(),
    active: z.boolean().optional(),
  })
  .strict();

export const supplierUpdateSchema = supplierCreateSchema
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'At least one field must be provided');

export const supplierListQuery = paginationQuery
  .extend({ search: z.string().trim().max(100).optional(), active: boolParam.optional() })
  .strict();

// ---- purchases ------------------------------------------------------------

export const purchaseCreateSchema = z
  .object({
    supplierId: positiveInt,
    items: z
      .array(
        z
          .object({ variantId: positiveInt, quantity: positiveInt.max(100000), unitCost: money })
          .strict(),
      )
      .min(1)
      .max(500),
    note: z.string().trim().max(500).optional(),
    /** Create and receive in one transaction. */
    receiveNow: z.boolean().optional(),
  })
  .strict();

export const purchaseListQuery = paginationQuery
  .merge(dateRangeQuery)
  .extend({
    status: z.enum(PURCHASE_STATUSES).optional(),
    supplierId: positiveInt.optional(),
    search: z.string().trim().max(100).optional(),
  })
  .strict();

// ---- returns --------------------------------------------------------------

export const returnCreateSchema = z
  .object({
    orderId: positiveInt,
    items: z
      .array(
        z
          .object({
            variantId: positiveInt,
            quantity: positiveInt.max(10000),
            reason: z.string().trim().max(300).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    reason: z.string().trim().max(300).optional(),
    /** Admin-only: accept and restock immediately. Defaults to true for admins. */
    autoAccept: z.boolean().optional(),
  })
  .strict();

export const returnListQuery = paginationQuery
  .merge(dateRangeQuery)
  .extend({
    orderId: positiveInt.optional(),
    variantId: positiveInt.optional(),
    status: z.enum(RETURN_STATUSES).optional(),
    customerId: positiveInt.optional(),
  })
  .strict();

export const returnDecisionSchema = z
  .object({ note: z.string().trim().max(500).optional(), reason: z.string().trim().max(500).optional() })
  .strict();

// ---- customers ------------------------------------------------------------

export const customerListQuery = paginationQuery
  .extend({ search: z.string().trim().max(100).optional(), active: boolParam.optional() })
  .strict();

export const customerStatusSchema = z.object({ active: z.boolean() }).strict();

export const profileUpdateSchema = z
  .object({
    name: trimmedString(2, 120).optional(),
    phone: z.string().trim().max(30).nullish(),
    email: z.string().trim().toLowerCase().email().max(200).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'At least one field must be provided');

// ---- reports / audit ------------------------------------------------------

export const reportQuery = dateRangeQuery
  .extend({
    source: z.enum(['POS', 'ONLINE']).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export const auditListQuery = paginationQuery
  .merge(dateRangeQuery)
  .extend({
    userId: positiveInt.optional(),
    action: z.string().trim().max(60).optional(),
    entityType: z.string().trim().max(60).optional(),
    entityId: z.string().trim().max(60).optional(),
  })
  .strict();

export const settingsUpdateSchema = z
  .object({ settings: z.record(z.string().min(1).max(100), z.string().max(500)) })
  .strict();
