import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CatalogApi } from '@/api/catalog.api';
import { qk } from '@/lib/queryClient';
import { ProductCard, ProductCardSkeleton } from '@/components/shop/ProductCard';
import { ShirtMark } from '@/components/shop/ProductImage';
import { LinkButton, ErrorState, EmptyState } from '@/components/ui';
import { useT } from '@/i18n';

export default function HomePage() {
  const t = useT();
  const featured = useQuery({
    queryKey: qk.catalog.products({ limit: 8, sort: 'newest' }),
    queryFn: () => CatalogApi.listProducts({ limit: 8, sort: 'newest' }),
  });


  return (
    <>
      {/* Hero */}
      <section className="border-b border-ink-200 bg-ink-50">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 md:py-20 lg:px-8">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl lg:text-5xl">
              {t('home.heroTitle')}
            </h1>
            <p className="mt-4 max-w-md text-base text-ink-600">
              {t('home.heroBody')}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <LinkButton to="/shop" size="lg">
                {t('home.shopShirts')}
              </LinkButton>
              <LinkButton to="/categories" variant="secondary" size="lg">
                {t('home.browseCategories')}
              </LinkButton>
            </div>
          </div>

          <div className="relative hidden aspect-[4/3] items-center justify-center rounded-lg border border-ink-200 bg-white md:flex">
            <ShirtMark className="h-40 w-40 text-ink-200" />
            <span className="sr-only">{t('home.shirtIllustration')}</span>
          </div>
        </div>
      </section>

      {/* Featured products */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-ink-900 sm:text-2xl">{t('home.featured')}</h2>
            <p className="mt-1 text-sm text-ink-600">{t('home.featuredBody')}</p>
          </div>
          <Link to="/shop" className="shrink-0 text-sm font-medium text-brand-600 hover:underline">
            {t('common.viewAll')}
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {featured.isLoading &&
            Array.from({ length: 8 }, (_, i) => <ProductCardSkeleton key={i} />)}

          {featured.isError && (
            <div className="col-span-full">
              <ErrorState error={featured.error} onRetry={() => void featured.refetch()} />
            </div>
          )}

          {featured.isSuccess &&
            featured.data.items.map((product) => <ProductCard key={product.id} product={product} />)}

          {featured.isSuccess && featured.data.items.length === 0 && (
            <div className="col-span-full">
              <EmptyState title={t('home.emptyTitle')} description={t('home.emptyBody')} />
            </div>
          )}
        </div>
      </section>

    </>
  );
}
