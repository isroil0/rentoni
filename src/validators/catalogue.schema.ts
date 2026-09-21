import { z } from 'zod';
import { boolParam, idParams, money, nonNegativeInt, paginationQuery, positiveInt, trimmedString } from './common';

export const categoryCreateSchema = z
  .object({
    name: trimmedString(2, 100),
    description: z.string().trim().max(500).nullish(),
    active: z.boolean().optional(),
  })
  .strict();

export const categoryUpdateSchema = categoryCreateSchema.partial().strict();

export const categoryListQuery = paginationQuery
  .extend({
    search: z.string().trim().max(100).optional(),
    active: boolParam.optional(),
  })
  .strict();

const imageSchema = z
  .object({
    url: z.string().trim().url('Image url must be a valid URL').max(1000),
    altText: z.string().trim().max(200).nullish(),
    sortOrder: nonNegativeInt.optional(),
    isPrimary: z.boolean().optional(),
  })
  .strict();

/** Variant payload shared by "create product with variants" and "create variant". */
export const variantCreateSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9._-]+$/, 'SKU may only contain letters, digits, dot, underscore and hyphen'),
    barcode: z.string().trim().min(4).max(64).nullish(),
    color: trimmedString(1, 50),
    size: trimmedString(1, 20),
    costPrice: money,
    sellingPrice: money,
    minimumStock: nonNegativeInt.optional(),
    active: z.boolean().optional(),
    initialStock: nonNegativeInt.optional(),
  })
  .strict();

export const variantUpdateSchema = variantCreateSchema
  .omit({ initialStock: true })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'At least one field must be provided');

export const productCreateSchema = z
  .object({
    categoryId: positiveInt.nullish(),
    name: trimmedString(2, 200),
    description: z.string().trim().max(2000).nullish(),
    brand: z.string().trim().max(120).nullish(),
    active: z.boolean().optional(),
    images: z.array(imageSchema).max(20).optional(),
    variants: z.array(variantCreateSchema).max(100).optional(),
  })
  .strict();

export const productUpdateSchema = z
  .object({
    categoryId: positiveInt.optional(),
    name: trimmedString(2, 200).optional(),
    description: z.string().trim().max(2000).nullish(),
    brand: z.string().trim().max(120).nullish(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'At least one field must be provided');

export const productListQuery = paginationQuery
  .extend({
    search: z.string().trim().max(200).optional(),
    categoryId: positiveInt.optional(),
    brand: z.string().trim().max(120).optional(),
    color: z.string().trim().max(50).optional(),
    size: z.string().trim().max(20).optional(),
    sku: z.string().trim().max(64).optional(),
    barcode: z.string().trim().max(64).optional(),
    minPrice: money.optional(),
    maxPrice: money.optional(),
    availability: z.enum(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']).optional(),
    active: boolParam.optional(),
    sort: z.enum(['newest', 'oldest', 'name_asc', 'name_desc', 'price_asc', 'price_desc']).optional(),
  })
  .strict()
  .refine(
    (v) => v.minPrice === undefined || v.maxPrice === undefined || v.minPrice <= v.maxPrice,
    { message: 'minPrice cannot be greater than maxPrice', path: ['minPrice'] },
  );

export const variantListQuery = paginationQuery
  .extend({
    productId: positiveInt.optional(),
    search: z.string().trim().max(100).optional(),
    color: z.string().trim().max(50).optional(),
    size: z.string().trim().max(20).optional(),
    active: boolParam.optional(),
  })
  .strict();

export const imagesCreateSchema = z.object({ images: z.array(imageSchema).min(1).max(20) }).strict();

export const productIdParams = idParams;
export const productImageParams = z.object({ id: positiveInt, imageId: positiveInt });
export const deleteQuery = z.object({ hard: boolParam.optional() }).strict();
