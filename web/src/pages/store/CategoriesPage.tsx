import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CatalogApi } from '@/api/catalog.api';
import { qk } from '@/lib/queryClient';
import { ShirtMark } from '@/components/shop/ProductImage';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { useT } from '@/i18n';

export default function CategoriesPage() {
  const t = useT();
  const categories = useQuery({
    queryKey: qk.catalog.categories(),
    queryFn: () => CatalogApi.listCategories(),
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold text-ink-900">{t('categories.title')}</h1>
      <p className="mt-1 text-sm text-ink-600">{t('categories.subtitle')}</p>

      {categories.isLoading && <LoadingState label={t('categories.loading')} />}
      {categories.isError && <ErrorState error={categories.error} onRetry={() => void categories.refetch()} />}

      {categories.isSuccess && categories.data.length === 0 && (
        <EmptyState title={t('categories.empty')} description={t('categories.emptyBody')} />
      )}

      {categories.isSuccess && categories.data.length > 0 && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.data.map((category) => (
            <Link
              key={category.id}
              to={`/shop?categoryId=${category.id}`}
              className="group rounded-lg border border-ink-200 bg-white p-6 transition-colors hover:border-ink-400"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-md bg-ink-50 text-ink-400 group-hover:text-brand-600">
                <ShirtMark className="h-6 w-6" />
              </span>
              <h2 className="mt-4 font-medium text-ink-900">{category.name}</h2>
              {category.description && <p className="mt-1 text-sm text-ink-600">{category.description}</p>}
              <p className="mt-3 text-sm text-ink-500">
                {t('common.productCount', { count: category.productCount ?? 0 })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
