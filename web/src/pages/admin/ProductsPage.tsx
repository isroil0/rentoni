import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { AdminCatalogApi } from '@/api/adminCatalog.api';
import { qk } from '@/lib/queryClient';
import { useDebounce } from '@/hooks/useDebounce';
import { formatNumber } from '@/lib/format';
import {
  Badge,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  LinkButton,
  LoadingState,
  Pagination,
  Select,
  StatusBadge,
  TableWrap,
  THead,
  TH,
  TBody,
  TR,
  TD,
  useErrorMessage,
  useToast,
} from '@/components/ui';
import { ProductImage } from '@/components/shop/ProductImage';
import type { AdminProduct } from '@/api/types';
import { useT } from '@/i18n';

export default function ProductsPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(params.get('search') ?? '');
  const search = useDebounce(searchInput, 300);
  const [toDelete, setToDelete] = useState<AdminProduct | null>(null);

  const page = Number(params.get('page')) || 1;
  const categoryId = params.get('categoryId') ? Number(params.get('categoryId')) : undefined;
  const activeParam = params.get('active');

  const query = {
    page,
    limit: 20,
    search: search || undefined,
    categoryId,
    active: activeParam === null ? undefined : activeParam === 'true',
  };

  const products = useQuery({
    queryKey: qk.admin.products(query),
    queryFn: () => AdminCatalogApi.listProducts(query),
    placeholderData: keepPreviousData,
  });

  const categories = useQuery({
    queryKey: qk.admin.categories({ limit: 100 }),
    queryFn: () => AdminCatalogApi.listCategories({ limit: 100 }),
    staleTime: 5 * 60_000,
  });

  const deactivate = useMutation({
    mutationFn: (product: AdminProduct) => AdminCatalogApi.deleteProduct(product.id),
    onSuccess: async () => {
      toast.success(t('admin.products.deactivated'));
      setToDelete(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      setToDelete(null);
    },
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-600">
          {products.isSuccess ? t('admin.products.countLabel', { count: products.data.meta.total }) : t('common.loading')}
        </p>
        <LinkButton to="/admin/products/new">{t('admin.products.addProduct')}</LinkButton>
      </div>

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-ink-200 p-4">
          <div className="min-w-56 flex-1">
            <label htmlFor="product-search" className="sr-only">
              {t('admin.products.searchLabel')}
            </label>
            <Input
              id="product-search"
              type="search"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                update({ search: e.target.value || undefined });
              }}
              placeholder={t('admin.products.searchPlaceholder')}
            />
          </div>
          <div>
            <label htmlFor="product-category" className="sr-only">
              {t('admin.products.filterCategory')}
            </label>
            <Select
              id="product-category"
              value={params.get('categoryId') ?? ''}
              onChange={(e) => update({ categoryId: e.target.value || undefined })}
            >
              <option value="">{t('shop.allCategories')}</option>
              {(categories.data?.items ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="product-status" className="sr-only">
              {t('admin.products.filterStatus')}
            </label>
            <Select
              id="product-status"
              value={params.get('active') ?? ''}
              onChange={(e) => update({ active: e.target.value || undefined })}
            >
              <option value="">{t('admin.products.anyStatus')}</option>
              <option value="true">{t('admin.products.active')}</option>
              <option value="false">{t('admin.products.inactive')}</option>
            </Select>
          </div>
        </div>

        {products.isLoading && <LoadingState label={t('admin.products.loading')} />}
        {products.isError && <ErrorState error={products.error} onRetry={() => void products.refetch()} />}

        {products.isSuccess && products.data.items.length === 0 && (
          <EmptyState
            title={t('admin.products.empty')}
            description={t('admin.products.emptyBody')}
            action={<LinkButton to="/admin/products/new">{t('admin.products.addProduct')}</LinkButton>}
          />
        )}

        {products.isSuccess && products.data.items.length > 0 && (
          <>
            <TableWrap>
              <THead>
                <TR>
                  <TH className="w-16">{t('common.image')}</TH>
                  <TH>{t('common.product')}</TH>
                  <TH>{t('common.category')}</TH>
                  <TH align="right">{t('admin.products.variants')}</TH>
                  <TH align="right">{t('admin.products.stock')}</TH>
                  <TH>{t('common.status')}</TH>
                  <TH align="right">{t('common.actions')}</TH>
                </TR>
              </THead>
              <TBody>
                {products.data.items.map((product) => (
                  <TR key={product.id}>
                    <TD>
                      <ProductImage
                        image={product.images.find((i) => i.isPrimary) ?? product.images[0]}
                        alt={product.name}
                        className="h-12 w-10 rounded border border-ink-200"
                      />
                    </TD>
                    <TD>
                      <Link to={`/admin/products/${product.id}`} className="font-medium text-ink-900 hover:text-brand-600">
                        {product.name}
                      </Link>
                      {product.brand && <p className="text-xs text-ink-500">{product.brand}</p>}
                    </TD>
                    <TD>{product.category?.name ?? '—'}</TD>
                    <TD align="right" className="tabular-nums">
                      {formatNumber(product.variantCount)}
                    </TD>
                    <TD align="right" className="tabular-nums">
                      {formatNumber(product.totalStock)}
                    </TD>
                    <TD>
                      {product.active ? <Badge tone="success">{t('admin.products.active')}</Badge> : <StatusBadge status="CANCELLED" />}
                    </TD>
                    <TD align="right">
                      <div className="flex justify-end gap-2 whitespace-nowrap">
                        <Link to={`/admin/products/${product.id}`} className="text-sm text-brand-600 hover:underline">
                          {t('common.view')}
                        </Link>
                        <Link to={`/admin/products/${product.id}/edit`} className="text-sm text-ink-600 hover:underline">
                          {t('common.edit')}
                        </Link>
                        {product.active && (
                          <button
                            type="button"
                            onClick={() => setToDelete(product)}
                            className="text-sm text-danger-600 hover:underline"
                          >
                            {t('common.deactivate')}
                          </button>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
            <Pagination meta={products.data.meta} onPageChange={(p) => update({ page: String(p) })} />
          </>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && deactivate.mutate(toDelete)}
        loading={deactivate.isPending}
        title={t('admin.products.deactivateTitle')}
        message={t('admin.products.deactivateBody', { name: toDelete?.name ?? '' })}
        confirmLabel={t('common.deactivate')}
      />
    </div>
  );
}
