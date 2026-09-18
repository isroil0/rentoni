import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { OrdersApi } from '@/api/orders.api';
import { qk } from '@/lib/queryClient';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import {
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
import { useDebounce } from '@/hooks/useDebounce';
import { useState } from 'react';
import type { OrderSource, OrderStatus, PaymentStatus } from '@/api/types';
import { useT } from '@/i18n';

export default function SalesPage() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(params.get('search') ?? '');
  const search = useDebounce(searchInput, 300);

  const query = {
    page: Number(params.get('page')) || 1,
    limit: 20,
    search: search || undefined,
    status: (params.get('status') as OrderStatus | null) ?? undefined,
    source: (params.get('source') as OrderSource | null) ?? undefined,
    paymentStatus: (params.get('paymentStatus') as PaymentStatus | null) ?? undefined,
    from: params.get('from') || undefined,
    to: params.get('to') || undefined,
  };

  const orders = useQuery({
    queryKey: qk.admin.orders(query),
    queryFn: () => OrdersApi.list(query),
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
      <p className="text-sm text-ink-600">
        {orders.isSuccess ? t('admin.sales.count', { count: orders.data.meta.total }) : t('common.loading')}
      </p>

      <Card>
        <div className="grid gap-3 border-b border-ink-200 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label htmlFor="sales-search" className="sr-only">
              {t('admin.sales.searchLabel')}
            </label>
            <Input
              id="sales-search"
              type="search"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                update({ search: e.target.value || undefined });
              }}
              placeholder={t('admin.sales.searchPlaceholder')}
            />
          </div>
          <div>
            <label htmlFor="sales-source" className="sr-only">
              {t('admin.sales.filterSource')}
            </label>
            <Select id="sales-source" value={params.get('source') ?? ''} onChange={(e) => update({ source: e.target.value || undefined })}>
              <option value="">{t('admin.sales.anySource')}</option>
              <option value="POS">{t('orderSource.POS')}</option>
              <option value="ONLINE">{t('orderSource.ONLINE')}</option>
            </Select>
          </div>
          <div>
            <label htmlFor="sales-status" className="sr-only">
              {t('admin.sales.filterStatus')}
            </label>
            <Select id="sales-status" value={params.get('status') ?? ''} onChange={(e) => update({ status: e.target.value || undefined })}>
              <option value="">{t('admin.sales.anyStatus')}</option>
              {['PENDING', 'CONFIRMED', 'PAID', 'COMPLETED', 'CANCELLED', 'REFUNDED'].map((status) => (
                <option key={status} value={status}>
                  {t(`orderStatus.${status}`)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="sales-payment" className="sr-only">
              {t('admin.sales.filterPayment')}
            </label>
            <Select
              id="sales-payment"
              value={params.get('paymentStatus') ?? ''}
              onChange={(e) => update({ paymentStatus: e.target.value || undefined })}
            >
              <option value="">{t('admin.sales.anyPayment')}</option>
              <option value="UNPAID">{t('paymentStatus.UNPAID')}</option>
              <option value="PAID">{t('paymentStatus.PAID')}</option>
              <option value="REFUNDED">{t('paymentStatus.REFUNDED')}</option>
            </Select>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label htmlFor="sales-from" className="sr-only">
                {t('admin.sales.fromDate')}
              </label>
              <Input id="sales-from" type="date" value={params.get('from') ?? ''} onChange={(e) => update({ from: e.target.value || undefined })} />
            </div>
            <div className="flex-1">
              <label htmlFor="sales-to" className="sr-only">
                {t('admin.sales.toDate')}
              </label>
              <Input id="sales-to" type="date" value={params.get('to') ?? ''} onChange={(e) => update({ to: e.target.value || undefined })} />
            </div>
          </div>
        </div>

        {orders.isLoading && <LoadingState label={t('admin.sales.loading')} />}
        {orders.isError && <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />}

        {orders.isSuccess && orders.data.items.length === 0 && (
          <EmptyState title={t('admin.sales.empty')} description={t('admin.sales.emptyBody')} />
        )}

        {orders.isSuccess && orders.data.items.length > 0 && (
          <>
            <TableWrap>
              <THead>
                <TR>
                  <TH>{t('admin.dashboard.order')}</TH>
                  <TH>{t('common.source')}</TH>
                  <TH>{t('common.customer')}</TH>
                  <TH align="right">{t('common.items')}</TH>
                  <TH align="right">{t('common.total')}</TH>
                  <TH>{t('common.payment')}</TH>
                  <TH>{t('common.status')}</TH>
                  <TH>{t('common.date')}</TH>
                </TR>
              </THead>
              <TBody>
                {orders.data.items.map((order) => (
                  <TR key={order.id}>
                    <TD>
                      <Link to={`/admin/sales/${order.id}`} className="font-mono text-xs font-medium text-ink-900 hover:text-brand-600">
                        {order.orderNumber}
                      </Link>
                    </TD>
                    <TD>
                      <StatusBadge status={order.source} />
                    </TD>
                    <TD className="max-w-40 truncate">
                      {order.customer?.name ?? order.customerName ?? <span className="text-ink-400">{t('admin.sales.walkIn')}</span>}
                    </TD>
                    <TD align="right" className="tabular-nums">
                      {formatNumber(order.itemCount)}
                    </TD>
                    <TD align="right" className="tabular-nums font-medium text-ink-900">
                      {formatMoney(order.total)}
                    </TD>
                    <TD>
                      <StatusBadge status={order.paymentStatus} />
                    </TD>
                    <TD>
                      <StatusBadge status={order.status} />
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-ink-500">{formatDateTime(order.createdAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
            <Pagination meta={orders.data.meta} onPageChange={(p) => update({ page: String(p) })} />
          </>
        )}
      </Card>
    </div>
  );
}
