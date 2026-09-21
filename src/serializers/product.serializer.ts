import { toMajor } from '../utils/money';
import { stockStatus } from '../utils/stock';

/**
 * Two distinct projections of the same rows:
 *  - `admin*`   : full detail including cost price, margins and exact stock.
 *  - `customer*`: strictly the public fields. Cost price, margin, supplier data and
 *                 inventory internals are never present in these objects, so they
 *                 cannot leak by accident.
 */

type ImageRow = {
  id: number;
  url: string;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
  createdAt?: Date;
};

type VariantRow = {
  id: number;
  productId: number;
  sku: string;
  barcode: string | null;
  color: string;
  size: string;
  costPriceCents: number;
  sellingPriceCents: number;
  minimumStock: number;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  inventory?: { quantity: number; updatedAt?: Date } | null;
};

export function serializeImage(image: ImageRow) {
  return {
    id: image.id,
    url: image.url,
    alt_text: image.altText,
    altText: image.altText,
    sortOrder: image.sortOrder,
    isPrimary: image.isPrimary,
    ...(image.createdAt ? { createdAt: image.createdAt } : {}),
  };
}

export function adminVariant(variant: VariantRow) {
  const quantity = variant.inventory?.quantity ?? 0;
  const margin = variant.sellingPriceCents - variant.costPriceCents;
  return {
    id: variant.id,
    productId: variant.productId,
    sku: variant.sku,
    barcode: variant.barcode,
    color: variant.color,
    size: variant.size,
    costPrice: toMajor(variant.costPriceCents),
    sellingPrice: toMajor(variant.sellingPriceCents),
    marginPerUnit: toMajor(margin),
    minimumStock: variant.minimumStock,
    active: variant.active,
    quantity,
    stockStatus: stockStatus(quantity, variant.minimumStock),
    ...(variant.createdAt ? { createdAt: variant.createdAt } : {}),
    ...(variant.updatedAt ? { updatedAt: variant.updatedAt } : {}),
  };
}

/** Customer-facing variant. No cost price, no margin, stock optional and configurable. */
export function customerVariant(variant: VariantRow, opts: { exposeExactStock: boolean }) {
  const quantity = variant.inventory?.quantity ?? 0;
  const status = stockStatus(quantity, variant.minimumStock);
  return {
    id: variant.id,
    sku: variant.sku,
    color: variant.color,
    size: variant.size,
    price: toMajor(variant.sellingPriceCents),
    availability: status,
    inStock: status !== 'OUT_OF_STOCK',
    ...(opts.exposeExactStock ? { quantity } : {}),
  };
}

type ProductRow = {
  id: number;
  categoryId: number | null;
  name: string;
  description: string | null;
  brand: string | null;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  category?: { id: number; name: string; active?: boolean } | null;
  variants?: VariantRow[];
  images?: ImageRow[];
};

export function adminProduct(product: ProductRow) {
  const variants = product.variants ?? [];
  return {
    id: product.id,
    categoryId: product.categoryId,
    category: product.category ? { id: product.category.id, name: product.category.name } : null,
    name: product.name,
    description: product.description,
    brand: product.brand,
    active: product.active,
    images: (product.images ?? []).map(serializeImage),
    variants: variants.map(adminVariant),
    variantCount: variants.length,
    totalStock: variants.reduce((sum, v) => sum + (v.inventory?.quantity ?? 0), 0),
    ...(product.createdAt ? { createdAt: product.createdAt } : {}),
    ...(product.updatedAt ? { updatedAt: product.updatedAt } : {}),
  };
}

export function customerProduct(product: ProductRow, opts: { exposeExactStock: boolean }) {
  const variants = (product.variants ?? []).filter((v) => v.active);
  const prices = variants.map((v) => v.sellingPriceCents);
  const totalQty = variants.reduce((sum, v) => sum + (v.inventory?.quantity ?? 0), 0);
  const minimumOfMinimums = variants.length
    ? Math.min(...variants.map((v) => v.minimumStock))
    : 0;

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    brand: product.brand,
    category: product.category ? { id: product.category.id, name: product.category.name } : null,
    images: (product.images ?? [])
      .slice()
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder)
      .map((i) => ({ id: i.id, url: i.url, altText: i.altText, isPrimary: i.isPrimary, sortOrder: i.sortOrder })),
    colors: [...new Set(variants.map((v) => v.color))],
    sizes: [...new Set(variants.map((v) => v.size))],
    priceFrom: prices.length ? toMajor(Math.min(...prices)) : null,
    priceTo: prices.length ? toMajor(Math.max(...prices)) : null,
    availability: stockStatus(totalQty, minimumOfMinimums),
    variants: variants.map((v) => customerVariant(v, opts)),
  };
}
