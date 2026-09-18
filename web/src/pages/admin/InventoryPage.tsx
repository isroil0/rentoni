import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { InventoryApi } from '@/api/inventory.api';
import { AdminCatalogApi } from '@/api/adminCatalog.api';
import { qk } from '@/lib/queryClient';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDateTime, formatNumber } from '@/lib/format';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
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
} from '@/components/ui';
import { AdjustStockDialog } from './inventory/AdjustStockDialog';
import type { InventoryRow, StockStatus } from '@/api/types';
import { useT } from '@/i18n';

export default function InventoryPage() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(params.get('search') ?? '');
  const search = useDebounce(searchInput, 300);
  const [adjusting, setAdjusting] = useState<InventoryRow | null>(null);

  const page = Number(params.get('page')) || 1;
  const status = (params.get('status') as StockStatus | null) ?? undefined;
  const categoryId = params.get('categoryId') ? Number(params.get('categoryId')) : undefined;

  const query = { page, limit: 20, search: search || undefined, status, categoryId };

  const inventory = useQuery({
    queryKey: qk.admin.inventory(query),
    queryFn: () => InventoryApi.list(query),
    placeholderData: keepPreviousData,
  });

  const categories = useQuery({
    queryKey: qk.admin.categories({ limit: 100 }),
    queryFn: () => AdminCatalogApi.listCategories({ limit: 100 }),
    staleTime: 5 * 60_000,
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
          {inventory.isSuccess ? t('admin.inventory.tracked', { count: inventory.data.meta.total }) : t('common.loading')}
        </p>
        <div className="flex gap-2">
          <Button
            variant={status === 'LOW_STOCK' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => update({ status: status === 'LOW_STOCK' ? undefined : 'LOW_STOCK' })}
          >
            {t('admin.inventory.lowStock')}
          </Button>
          <Button
            variant={status === 'OUT_OF_STOCK' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => update({ status: status === 'OUT_OF_STOCK' ? undefined : 'OUT_OF_STOCK' })}
          >
            {t('admin.inventory.outOfStock')}
          </Button>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-ink-200 p-4">
          <div className="min-w-56 flex-1">
            <label htmlFor="inventory-search" className="sr-only">
              {t('admin.inventory.searchLabel')}
            </label>
            <Input
              id="inventory-search"
              type="search"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                update({ search: e.target.value || undefined });
              }}
              placeholder={t('admin.inventory.searchPlaceholder')}
            />
          </div>
          <div>
            <label htmlFor="inventory-category" className="sr-only">
              {t('admin.inventory.filterCategory')}
            </label>
            <Select
              id="inventory-category"
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
            <label htmlFor="inventory-status" className="sr-only">
              {t('admin.inventory.filterStatus')}
            </label>
            <Select
              id="inventory-status"
              value={params.get('status') ?? ''}
              onChange={(e) => update({ status: e.target.value || undefined })}
            >
              <option value="">{t('admin.inventory.anyStatus')}</option>
              <option value="IN_STOCK">{t('stockStatus.IN_STOCK')}</option>
              <option value="LOW_STOCK">{t('stockStatus.LOW_STOCK')}</option>
              <option value="OUT_OF_STOCK">{t('stockStatus.OUT_OF_STOCK')}</option>
            </Select>
          </div>
        </div>

        {inventory.isLoading && <LoadingState label={t('admin.inventory.loading')} />}
        {inventory.isError && <ErrorState error={inventory.error} onRetry={() => void inventory.refetch()} />}

        {inventory.isSuccess && inventory.data.items.length === 0 && (
          <EmptyState title={t('admin.inventory.empty')} description={t('admin.inventory.emptyBody')} />
        )}

        {inventory.isSuccess && inventory.data.items.length > 0 && (
          <>
            <TableWrap>
              <THead>
                <TR>
                  <TH>{t('common.product')}</TH>
                  <TH>{t('common.sku')}</TH>
                  <TH>{t('common.colour')}</TH>
                  <TH>{t('common.size')}</TH>
                  <TH align="right">{t('common.quantity')}</TH>
                  <TH align="right">{t('admin.dashboard.minimum')}</TH>
                  <TH>{t('common.status')}</TH>
                  <TH>{t('admin.inventory.lastUpdated')}</TH>
                  <TH align="right">{t('common.actions')}</TH>
                </TR>
              </THead>
              <TBody>
                {inventory.data.items.map((row) => (
                  <TR key={row.variantId}>
                    <TD>
                      <Link to={`/admin/inventory/${row.variantId}`} className="font-medium text-ink-900 hover:text-brand-600">
                        {row.product.name}
                      </Link>
                    </TD>
                    <TD className="font-mono text-xs">{row.sku}</TD>
                    <TD>{row.color}</TD>
                    <TD>{row.size}</TD>
                    <TD align="right" className="tabular-nums font-medium text-ink-900">
                      {formatNumber(row.quantity)}
                    </TD>
                    <TD align="right" className="tabular-nums text-ink-500">
                      {formatNumber(row.minimumStock)}
                    </TD>
                    <TD>
                      <StatusBadge status={row.status} />
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-ink-500">{formatDateTime(row.updatedAt)}</TD>
                    <TD align="right">
                      <div className="flex justify-end gap-2 whitespace-nowrap">
                        <button type="button" onClick={() => setAdjusting(row)} className="text-sm text-brand-600 hover:underline">
                          {t('admin.inventory.adjust')}
                        </button>
                        <Link to={`/admin/inventory/${row.variantId}`} className="text-sm text-ink-600 hover:underline">
                          {t('admin.inventory.history')}
                        </Link>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
            <Pagination meta={inventory.data.meta} onPageChange={(p) => update({ page: String(p) })} />
          </>
        )}
      </Card>

      <AdjustStockDialog
        open={Boolean(adjusting)}
        onClose={() => setAdjusting(null)}
        variantId={adjusting?.variantId ?? null}
        label={adjusting ? `${adjusting.product.name} · ${adjusting.color} · ${adjusting.size}` : ''}
        currentQuantity={adjusting?.quantity ?? 0}
      />
    </div>
  );
}
