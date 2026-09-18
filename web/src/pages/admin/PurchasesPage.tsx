import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { PurchasesApi } from '@/api/purchases.api';
import { qk } from '@/lib/queryClient';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import {
  Card,
  EmptyState,
  ErrorState,
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
} from '@/components/ui';
import type { PurchaseStatus } from '@/api/types';
import { useT } from '@/i18n';

export default function PurchasesPage() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page')) || 1;
  const status = (params.get('status') as PurchaseStatus | null) ?? undefined;
  const query = { page, limit: 20, status };

  const purchases = useQuery({
    queryKey: qk.admin.purchases(query),
    queryFn: () => PurchasesApi.list(query),
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-600">
          {purchases.isSuccess ? t('admin.purchases.count', { count: purchases.data.meta.total }) : t('common.loading')}
        </p>
        <LinkButton to="/admin/purchases/new">{t('admin.purchases.newPurchase')}</LinkButton>
      </div>

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-ink-200 p-4">
          <div>
            <label htmlFor="purchase-status" className="sr-only">
              {t('admin.purchases.filterStatus')}
            </label>
            <Select
              id="purchase-status"
              value={params.get('status') ?? ''}
              onChange={(e) => update({ status: e.target.value || undefined })}
            >
              <option value="">{t('admin.purchases.anyStatus')}</option>
              <option value="DRAFT">{t('purchaseStatus.DRAFT')}</option>
              <option value="RECEIVED">{t('purchaseStatus.RECEIVED')}</option>
              <option value="CANCELLED">{t('purchaseStatus.CANCELLED')}</option>
            </Select>
          </div>
        </div>

        {purchases.isLoading && <LoadingState label={t('admin.purchases.loading')} />}
        {purchases.isError && <ErrorState error={purchases.error} onRetry={() => void purchases.refetch()} />}

        {purchases.isSuccess && purchases.data.items.length === 0 && (
          <EmptyState
            title={t('admin.purchases.empty')}
            description={t('admin.purchases.emptyBody')}
            action={<LinkButton to="/admin/purchases/new">{t('admin.purchases.newPurchase')}</LinkButton>}
          />
        )}

        {purchases.isSuccess && purchases.data.items.length > 0 && (
          <>
            <TableWrap>
              <THead>
                <TR>
                  <TH>{t('admin.purchases.purchase')}</TH>
                  <TH>{t('common.supplier')}</TH>
                  <TH>{t('common.status')}</TH>
                  <TH align="right">{t('common.units')}</TH>
                  <TH align="right">{t('admin.purchases.totalCost')}</TH>
                  <TH>{t('admin.purchases.created')}</TH>
                  <TH align="right">{t('common.actions')}</TH>
                </TR>
              </THead>
              <TBody>
                {purchases.data.items.map((purchase) => (
                  <TR key={purchase.id}>
                    <TD>
                      <Link
                        to={`/admin/purchases/${purchase.id}`}
                        className="font-mono text-xs font-medium text-ink-900 hover:text-brand-600"
                      >
                        {purchase.purchaseNumber}
                      </Link>
                    </TD>
                    <TD>{purchase.supplier.name}</TD>
                    <TD>
                      <StatusBadge status={purchase.status} />
                    </TD>
                    <TD align="right" className="tabular-nums">
                      {formatNumber(purchase.itemCount)}
                    </TD>
                    <TD align="right" className="tabular-nums font-medium text-ink-900">
                      {formatMoney(purchase.totalCost)}
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-ink-500">{formatDate(purchase.createdAt)}</TD>
                    <TD align="right">
                      <Link to={`/admin/purchases/${purchase.id}`} className="text-sm text-brand-600 hover:underline">
                        {purchase.status === 'DRAFT' ? t('admin.purchases.receive') : t('common.view')}
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
            <Pagination meta={purchases.data.meta} onPageChange={(p) => update({ page: String(p) })} />
          </>
        )}
      </Card>
    </div>
  );
}
