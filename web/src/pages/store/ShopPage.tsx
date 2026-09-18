import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { CatalogApi } from '@/api/catalog.api';
import { qk } from '@/lib/queryClient';
import { useDebounce } from '@/hooks/useDebounce';
import { ProductCard, ProductCardSkeleton } from '@/components/shop/ProductCard';
import { Button, EmptyState, ErrorState, Pagination, Select } from '@/components/ui';
import type { ProductQuery, StockStatus } from '@/api/types';
import { useT } from '@/i18n';

/**
 * Filtering and pagination are entirely server-driven: the page asks the backend for
 * exactly the twenty products it renders, never the whole catalogue.
 */
export default function ShopPage() {
  const t = useT();
  const SORTS: { value: NonNullable<ProductQuery['sort']>; label: string }[] = [
    { value: 'newest', label: t('shop.sort.newest') },
    { value: 'price_asc', label: t('shop.sort.priceAsc') },
    { value: 'price_desc', label: t('shop.sort.priceDesc') },
    { value: 'name_asc', label: t('shop.sort.nameAsc') },
    { value: 'name_desc', label: t('shop.sort.nameDesc') },
  ];
  const AVAILABILITY: { value: StockStatus | ''; label: string }[] = [
    { value: '', label: t('shop.anyAvailability') },
    { value: 'IN_STOCK', label: t('stock.inStock') },
    { value: 'LOW_STOCK', label: t('stock.lowStock') },
    { value: 'OUT_OF_STOCK', label: t('stock.outOfStock') },
  ];
  const [params, setParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(params.get('search') ?? '');
  const debouncedSearch = useDebounce(searchInput, 350);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const categories = useQuery({
    queryKey: qk.catalog.categories(),
    queryFn: () => CatalogApi.listCategories(),
    staleTime: 5 * 60_000,
  });

  // Keep the URL in sync with the debounced search box so results are shareable.
  useEffect(() => {
    const current = params.get('search') ?? '';
    if (current === debouncedSearch) return;
    const next = new URLSearchParams(params);
    if (debouncedSearch) next.set('search', debouncedSearch);
    else next.delete('search');
    next.delete('page');
    setParams(next, { replace: true });
  }, [debouncedSearch, params, setParams]);

  const query = useMemo<ProductQuery>(() => {
    const num = (key: string) => {
      const raw = params.get(key);
      const value = raw ? Number(raw) : NaN;
      return Number.isFinite(value) ? value : undefined;
    };
    return {
      page: num('page') ?? 1,
      limit: 20,
      search: params.get('search') || undefined,
      categoryId: num('categoryId'),
      color: params.get('color') || undefined,
      size: params.get('size') || undefined,
      minPrice: num('minPrice'),
      maxPrice: num('maxPrice'),
      availability: (params.get('availability') as StockStatus | null) ?? undefined,
      sort: (params.get('sort') as ProductQuery['sort']) ?? undefined,
    };
  }, [params]);

  const products = useQuery({
    queryKey: qk.catalog.products(query),
    queryFn: () => CatalogApi.listProducts(query),
    placeholderData: keepPreviousData,
  });

  function update(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  }

  function clearFilters() {
    setSearchInput('');
    setParams(new URLSearchParams());
  }

  // Colour and size options come from whatever the catalogue actually contains.
  const { colorOptions, sizeOptions } = useMemo(() => {
    const colors = new Set<string>();
    const sizes = new Set<string>();
    for (const product of products.data?.items ?? []) {
      product.colors.forEach((c) => colors.add(c));
      product.sizes.forEach((s) => sizes.add(s));
    }
    return { colorOptions: [...colors].sort(), sizeOptions: [...sizes] };
  }, [products.data]);

  const activeFilterCount = ['categoryId', 'color', 'size', 'minPrice', 'maxPrice', 'availability'].filter((key) =>
    params.get(key),
  ).length;

  const filters = (
    <div className="space-y-5">
      <div>
        <label htmlFor="filter-category" className="mb-1.5 block text-sm font-medium text-ink-700">
          {t('common.category')}
        </label>
        <Select
          id="filter-category"
          value={params.get('categoryId') ?? ''}
          onChange={(e) => update({ categoryId: e.target.value || undefined })}
        >
          <option value="">{t('shop.allCategories')}</option>
          {(categories.data ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <label htmlFor="filter-color" className="mb-1.5 block text-sm font-medium text-ink-700">
          {t('common.colour')}
        </label>
        <Select
          id="filter-color"
          value={params.get('color') ?? ''}
          onChange={(e) => update({ color: e.target.value || undefined })}
        >
          <option value="">{t('shop.anyColour')}</option>
          {colorOptions.map((color) => (
            <option key={color} value={color}>
              {color}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <label htmlFor="filter-size" className="mb-1.5 block text-sm font-medium text-ink-700">
          {t('common.size')}
        </label>
        <Select
          id="filter-size"
          value={params.get('size') ?? ''}
          onChange={(e) => update({ size: e.target.value || undefined })}
        >
          <option value="">{t('shop.anySize')}</option>
          {sizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </Select>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink-700">{t('shop.priceRange')}</legend>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            inputMode="decimal"
            aria-label={t('shop.minPrice')}
            placeholder={t('shop.min')}
            defaultValue={params.get('minPrice') ?? ''}
            onBlur={(e) => update({ minPrice: e.target.value || undefined })}
            className="h-10 w-full rounded-md border border-ink-300 px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
          />
          <span className="text-ink-400" aria-hidden="true">
            –
          </span>
          <input
            type="number"
            min={0}
            inputMode="decimal"
            aria-label={t('shop.maxPrice')}
            placeholder={t('shop.max')}
            defaultValue={params.get('maxPrice') ?? ''}
            onBlur={(e) => update({ maxPrice: e.target.value || undefined })}
            className="h-10 w-full rounded-md border border-ink-300 px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
          />
        </div>
      </fieldset>

      <div>
        <label htmlFor="filter-availability" className="mb-1.5 block text-sm font-medium text-ink-700">
          {t('shop.availability')}
        </label>
        <Select
          id="filter-availability"
          value={params.get('availability') ?? ''}
          onChange={(e) => update({ availability: e.target.value || undefined })}
        >
          {AVAILABILITY.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      {activeFilterCount > 0 && (
        <Button variant="secondary" fullWidth onClick={clearFilters}>
          {t('common.clearFilters')}
        </Button>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">{t('shop.title')}</h1>
          <p className="mt-1 text-sm text-ink-600">
            {products.isSuccess
              ? t('common.productCount', { count: products.data.meta.total })
              : t('common.loading')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="sort" className="sr-only">
            {t('shop.sortLabel')}
          </label>
          <Select
            id="sort"
            className="w-auto"
            value={params.get('sort') ?? 'newest'}
            onChange={(e) => update({ sort: e.target.value })}
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Button variant="secondary" className="lg:hidden" onClick={() => setFiltersOpen((v) => !v)}>
            {t('common.filters')}{activeFilterCount > 0 && ` (${activeFilterCount})`}
          </Button>
        </div>
      </div>

      <div className="mt-6">
        <label htmlFor="shop-search" className="sr-only">
          {t('shop.searchLabel')}
        </label>
        <input
          id="shop-search"
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t('shop.searchPlaceholder')}
          className="h-11 w-full rounded-md border border-ink-300 px-4 text-sm placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
        />
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[16rem_1fr]">
        <aside className={`${filtersOpen ? 'block' : 'hidden'} lg:block`} aria-label={t('shop.filtersLabel')}>
          <div className="rounded-lg border border-ink-200 p-5">{filters}</div>
        </aside>

        <div>
          {products.isError ? (
            <ErrorState error={products.error} onRetry={() => void products.refetch()} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                {products.isLoading && Array.from({ length: 8 }, (_, i) => <ProductCardSkeleton key={i} />)}
                {products.data?.items.map((product) => <ProductCard key={product.id} product={product} />)}
              </div>

              {products.isSuccess && products.data.items.length === 0 && (
                <EmptyState
                  title={query.search ? t('shop.noMatches') : t('home.emptyTitle')}
                  description={t('shop.noMatchesBody')}
                  action={
                    <Button variant="secondary" onClick={clearFilters}>
                      {t('common.clearFilters')}
                    </Button>
                  }
                />
              )}

              {products.isSuccess && products.data.items.length > 0 && (
                <Pagination
                  meta={products.data.meta}
                  onPageChange={(page) => update({ page: String(page) })}
                  className="mt-4"
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
