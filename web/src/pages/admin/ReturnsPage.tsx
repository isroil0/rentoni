import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { ReturnsApi } from '@/api/returns.api';
import { OrdersApi } from '@/api/orders.api';
import { qk } from '@/lib/queryClient';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDateTime, formatMoney } from '@/lib/format';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
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
  useErrorMessage,
  useToast,
} from '@/components/ui';
import { CreateReturnDialog } from './returns/CreateReturnDialog';
import type { ReturnStatus } from '@/api/types';
import { useT } from '@/i18n';

export default function AdminReturnsPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [orderSearch, setOrderSearch] = useState('');
  const debouncedOrderSearch = useDebounce(orderSearch, 300);
  const [returnFor, setReturnFor] = useState<number | null>(null);

  const query = {
    page: Number(params.get('page')) || 1,
    limit: 20,
    status: (params.get('status') as ReturnStatus | null) ?? undefined,
  };

  const returns = useQuery({
    queryKey: qk.admin.returns(query),
    queryFn: () => ReturnsApi.list(query),
    placeholderData: keepPreviousData,
  });

  // Step 1 of the return flow: find the original order.
  const orderLookup = useQuery({
    queryKey: qk.admin.orders({ search: debouncedOrderSearch, limit: 5, returnable: true }),
    queryFn: () => OrdersApi.list({ search: debouncedOrderSearch, limit: 5 }),
    enabled: debouncedOrderSearch.trim().length > 2,
  });

  const decide = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'accept' | 'reject' }) =>
      action === 'accept' ? ReturnsApi.accept(id) : ReturnsApi.reject(id, t('admin.returns.rejectReason')),
    onSuccess: async (_data, variables) => {
      toast.success(
        variables.action === 'accept' ? t('admin.returns.accepted') : t('admin.returns.rejected'),
      );
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
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
    <div className="space-y-6">
      {/* Start a return */}
      <Card>
        <CardHeader title={t('admin.returns.recordTitle')} description={t('admin.returns.recordBody')} />
        <CardBody className="space-y-3">
          <label htmlFor="return-order-search" className="sr-only">
            {t('admin.returns.searchOrder')}
          </label>
          <Input
            id="return-order-search"
            type="search"
            value={orderSearch}
            onChange={(e) => setOrderSearch(e.target.value)}
            placeholder={t('admin.returns.searchPlaceholder')}
          />

          {orderLookup.isSuccess && debouncedOrderSearch.length > 2 && (
            <ul className="divide-y divide-ink-100 rounded-md border border-ink-200">
              {orderLookup.data.items.length === 0 && (
                <li className="p-3 text-sm text-ink-500">{t('admin.returns.noOrders')}</li>
              )}
              {orderLookup.data.items.map((order) => {
                const eligible = ['PAID', 'COMPLETED'].includes(order.status);
                return (
                  <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <span className="font-mono text-xs font-medium text-ink-900">{order.orderNumber}</span>
                      <span className="ml-2 text-sm text-ink-600">
                        {order.customer?.name ?? order.customerName ?? t('admin.sales.walkIn')} ·{' '}
                        {formatMoney(order.total)}
                      </span>
                      <span className="ml-2">
                        <StatusBadge status={order.status} />
                      </span>
                    </div>
                    <Button size="sm" variant="secondary" disabled={!eligible} onClick={() => setReturnFor(order.id)}>
                      {eligible ? t('admin.returns.startReturn') : t('admin.returns.notEligible')}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Returns list */}
      <Card>
        <CardHeader
          title={t('admin.returns.title')}
          description={returns.isSuccess ? t('admin.returns.recorded', { count: returns.data.meta.total }) : undefined}
          action={
            <div>
              <label htmlFor="returns-status" className="sr-only">
                {t('admin.returns.filterStatus')}
              </label>
              <Select
                id="returns-status"
                value={params.get('status') ?? ''}
                onChange={(e) => update({ status: e.target.value || undefined })}
              >
                <option value="">{t('admin.returns.anyStatus')}</option>
                <option value="REQUESTED">{t('returnStatus.REQUESTED')}</option>
                <option value="ACCEPTED">{t('returnStatus.ACCEPTED')}</option>
                <option value="REJECTED">{t('returnStatus.REJECTED')}</option>
              </Select>
            </div>
          }
        />

        {returns.isLoading && <LoadingState label={t('admin.returns.loading')} />}
        {returns.isError && <ErrorState error={returns.error} onRetry={() => void returns.refetch()} />}

        {returns.isSuccess && returns.data.items.length === 0 && (
          <EmptyState title={t('admin.returns.empty')} description={t('admin.returns.emptyBody')} />
        )}

        {returns.isSuccess && returns.data.items.length > 0 && (
          <>
            <TableWrap>
              <THead>
                <TR>
                  <TH>{t('admin.returns.returnLabel')}</TH>
                  <TH>{t('admin.dashboard.order')}</TH>
                  <TH>{t('common.product')}</TH>
                  <TH>{t('common.variant')}</TH>
                  <TH align="right">{t('admin.pos.receipt.qty')}</TH>
                  <TH>{t('common.reason')}</TH>
                  <TH>{t('common.status')}</TH>
                  <TH>{t('admin.returns.createdByLabel')}</TH>
                  <TH>{t('common.date')}</TH>
                  <TH align="right">{t('common.actions')}</TH>
                </TR>
              </THead>
              <TBody>
                {returns.data.items.map((row) => (
                  <TR key={row.id}>
                    <TD className="font-mono text-xs font-medium text-ink-900">{row.returnNumber}</TD>
                    <TD>
                      <Link to={`/admin/sales/${row.orderId}`} className="font-mono text-xs text-brand-600 hover:underline">
                        {row.orderNumber}
                      </Link>
                    </TD>
                    <TD className="max-w-40 truncate">{row.productName}</TD>
                    <TD className="whitespace-nowrap text-xs">
                      {row.color} · {row.size}
                    </TD>
                    <TD align="right" className="tabular-nums">
                      {row.quantity}
                    </TD>
                    <TD className="max-w-40 truncate text-xs text-ink-500">{row.reason ?? '—'}</TD>
                    <TD>
                      <StatusBadge status={row.status} />
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-ink-600">{row.createdBy?.name ?? '—'}</TD>
                    <TD className="whitespace-nowrap text-xs text-ink-500">{formatDateTime(row.createdAt)}</TD>
                    <TD align="right">
                      {row.status === 'REQUESTED' ? (
                        <div className="flex justify-end gap-2 whitespace-nowrap">
                          <button
                            type="button"
                            disabled={decide.isPending}
                            onClick={() => decide.mutate({ id: row.id, action: 'accept' })}
                            className="text-sm text-success-700 hover:underline disabled:opacity-50"
                          >
                            {t('admin.returns.accept')}
                          </button>
                          <button
                            type="button"
                            disabled={decide.isPending}
                            onClick={() => decide.mutate({ id: row.id, action: 'reject' })}
                            className="text-sm text-danger-600 hover:underline disabled:opacity-50"
                          >
                            {t('admin.returns.reject')}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-ink-400">{formatMoney(row.refundAmount)}</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
            <Pagination meta={returns.data.meta} onPageChange={(p) => update({ page: String(p) })} />
          </>
        )}
      </Card>

      {returnFor !== null && (
        <CreateReturnDialog open onClose={() => setReturnFor(null)} orderId={returnFor} />
      )}
    </div>
  );
}
