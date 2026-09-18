import { z } from 'zod';
import { PAGINATION } from '../config/constants';

/** Query strings arrive as text, so every scalar needs explicit coercion. */
export const boolParam = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

export const intParam = z.coerce.number().int();
export const positiveInt = z.coerce.number().int().positive();
export const nonNegativeInt = z.coerce.number().int().min(0);

/** Money in major units: non-negative and at most 2 decimal places. */
export const money = z.coerce
  .number()
  .min(0, 'Price cannot be negative')
  .refine((v) => Number.isFinite(v), 'Price must be a finite number')
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'Price supports at most 2 decimal places');

export const idParams = z.object({ id: positiveInt });

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
});

export const dateRangeQuery = z.object({
  from: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  to: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  preset: z.enum(['today', 'week', 'month', 'year']).optional(),
});

export const trimmedString = (min: number, max: number) =>
  z.string().trim().min(min).max(max);

export const optionalTrimmed = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));

export function toDate(value?: string): Date | undefined {
  return value ? new Date(value) : undefined;
}
