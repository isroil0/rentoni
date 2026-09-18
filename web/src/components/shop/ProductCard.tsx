import { Link } from 'react-router-dom';
import { ProductImage } from './ProductImage';
import { PriceDisplay } from './PriceDisplay';
import { AvailabilityBadge } from './AvailabilityBadge';
import type { CustomerProduct } from '@/api/types';
import { useT } from '@/i18n';

/**
 * Storefront product card. Shows only public catalogue data — there is no cost price,
 * margin, supplier or internal stock figure anywhere in the customer product payload.
 */
export function ProductCard({ product }: { product: CustomerProduct }) {
  const t = useT();
  const primary = product.images.find((image) => image.isPrimary) ?? product.images[0];
  const soldOut = product.availability === 'OUT_OF_STOCK';

  return (
    <article className="group flex flex-col overflow-hidden rounded-lg border border-ink-200 bg-white transition-shadow hover:shadow-sm">
      <Link
        to={`/products/${product.id}`}
        className="block focus-visible:outline-none"
        aria-label={t('product.view', { name: product.name })}
      >
        <div className="relative">
          <ProductImage
            image={primary}
            alt={product.name}
            sizes="(min-width: 1280px) 20vw, (min-width: 768px) 33vw, 50vw"
            className="aspect-[4/5] w-full transition-transform duration-300 group-hover:scale-[1.02]"
          />
          {soldOut && (
            <span className="absolute left-3 top-3">
              <AvailabilityBadge status="OUT_OF_STOCK" />
            </span>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="min-w-0">
          {product.brand && <p className="text-xs uppercase tracking-wide text-ink-400">{product.brand}</p>}
          <h3 className="truncate text-sm font-medium text-ink-900">
            <Link to={`/products/${product.id}`} className="hover:text-brand-600">
              {product.name}
            </Link>
          </h3>
        </div>

        <PriceDisplay priceFrom={product.priceFrom} priceTo={product.priceTo} className="text-base" />

        {product.colors.length > 0 && (
          <p className="text-xs text-ink-500">
            <span className="sr-only">{t('product.availableColours')}</span>
            {product.colors.join(' · ')}
          </p>
        )}

        {product.sizes.length > 0 && (
          <p className="text-xs text-ink-500">
            <span className="sr-only">{t('product.availableSizes')}</span>
            {product.sizes.join(' · ')}
          </p>
        )}

        <div className="mt-auto pt-2">
          <Link
            to={`/products/${product.id}`}
            className="inline-flex h-9 w-full items-center justify-center rounded-md border border-ink-300 text-sm font-medium text-ink-800 transition-colors hover:bg-ink-50"
          >
            {t('product.viewProduct')}
          </Link>
        </div>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-ink-200 bg-white" aria-hidden="true">
      <div className="aspect-[4/5] w-full animate-pulse bg-ink-100" />
      <div className="space-y-2 p-4">
        <div className="h-3 w-1/3 animate-pulse rounded bg-ink-100" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-ink-100" />
        <div className="h-4 w-1/4 animate-pulse rounded bg-ink-100" />
        <div className="h-9 w-full animate-pulse rounded bg-ink-100" />
      </div>
    </div>
  );
}
