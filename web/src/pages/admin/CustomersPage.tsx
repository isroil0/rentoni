import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { CustomersApi } from '@/api/customers.api';
import { qk } from '@/lib/queryClient';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Pagination,
  Select,
  TableWrap,
  THead,
  TH,
  TBody,
  TR,
  TD,
} from '@/components/ui';
import { useT } from '@/i18n';

export default function CustomersPage() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(params.get('search') ?? '');
  const search = useDebounce(searchInput, 300);
  const activeParam = params.get('active');

  const query = {
    page: Number(params.get('page')) || 1,
    limit: 20,
    search: search || undefined,
    active: activeParam === null ? undefined : activeParam === 'true',
  };

  const customers = useQuery({
    queryKey: qk.admin.customers(query),
    queryFn: () => CustomersApi.list(query),
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
        {customers.isSuccess ? t('admin.customers.count', { count: customers.data.meta.total }) : t('common.loading')}
      </p>

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-ink-200 p-4">
          <div className="min-w-56 flex-1">
            <label htmlFor="customer-search" className="sr-only">
              {t('admin.customers.searchLabel')}
            </label>
            <Input
              id="customer-search"
              type="search"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                update({ search: e.target.value || undefined });
              }}
              placeholder={t('admin.customers.searchPlaceholder')}
            />
          </div>
          <div>
            <label htmlFor="customer-status" className="sr-only">
              {t('admin.customers.filterStatus')}
            </label>
            <Select id="customer-status" value={activeParam ?? ''} onChange={(e) => update({ active: e.target.value || undefined })}>
              <option value="">{t('admin.customers.anyStatus')}</option>
              <option value="true">{t('admin.customers.active')}</option>
              <option value="false">{t('admin.customers.deactivated')}</option>
            </Select>
          </div>
        </div>

        {customers.isLoading && <LoadingState label={t('admin.customers.loading')} />}
        {customers.isError && <ErrorState error={customers.error} onRetry={() => void customers.refetch()} />}

        {customers.isSuccess && customers.data.items.length === 0 && (
          <EmptyState title={t('admin.customers.empty')} description={t('admin.customers.emptyBody')} />
        )}

        {customers.isSuccess && customers.data.items.length > 0 && (
          <>
            <TableWrap>
              <THead>
                <TR>
                  <TH>{t('common.name')}</TH>
                  <TH>{t('common.email')}</TH>
                  <TH>{t('common.phone')}</TH>
                  <TH>{t('admin.customers.registered')}</TH>
                  <TH>{t('common.status')}</TH>
                  <TH align="right">{t('common.orders')}</TH>
                  <TH align="right">{t('admin.customers.totalSpent')}</TH>
                </TR>
              </THead>
              <TBody>
                {customers.data.items.map((customer) => (
                  <TR key={customer.id}>
                    <TD>
                      <Link to={`/admin/customers/${customer.id}`} className="font-medium text-ink-900 hover:text-brand-600">
                        {customer.name}
                      </Link>
                    </TD>
                    <TD className="text-ink-600">{customer.email}</TD>
                    <TD className="text-ink-600">{customer.phone ?? '—'}</TD>
                    <TD className="whitespace-nowrap text-xs text-ink-500">{formatDate(customer.createdAt)}</TD>
                    <TD>
                      {customer.active ? (
                        <Badge tone="success">{t('admin.customers.active')}</Badge>
                      ) : (
                        <Badge tone="neutral">{t('admin.customers.deactivated')}</Badge>
                      )}
                    </TD>
                    <TD align="right" className="tabular-nums">
                      {formatNumber(customer.orderCount)}
                    </TD>
                    <TD align="right" className="tabular-nums font-medium text-ink-900">
                      {formatMoney(customer.totalSpent)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
            <Pagination meta={customers.data.meta} onPageChange={(p) => update({ page: String(p) })} />
          </>
        )}
      </Card>
    </div>
  );
}
