import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { CustomerApi } from '@/api/customer.api';
import { qk } from '@/lib/queryClient';
import { formatDate, formatMoney } from '@/lib/format';
import { Card, EmptyState, ErrorState, LinkButton, LoadingState, Pagination, StatusBadge } from '@/components/ui';
import { useT } from '@/i18n';

export default function ReturnsPage() {
  const t = useT();
  const [page, setPage] = useState(1);
  const query = { page, limit: 10 };

  const returns = useQuery({
    queryKey: qk.customer.returns(query),
    queryFn: () => CustomerApi.listReturns(query),
    placeholderData: keepPreviousData,
  });

  if (returns.isLoading) return <LoadingState label={t('account.loadingReturns')} />;
  if (returns.isError || !returns.data) return <ErrorState error={returns.error} onRetry={() => void returns.refetch()} />;

  if (returns.data.items.length === 0) {
    return (
      <EmptyState
        title={t('account.returnsEmpty')}
        description={t('account.returnsEmptyBody')}
        action={
          <LinkButton to="/account/orders" variant="secondary">
            {t('account.viewMyOrders')}
          </LinkButton>
        }
      />
    );
  }

  return (
    <Card>
      <ul className="divide-y divide-ink-100">
        {returns.data.items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold text-ink-900">{item.returnNumber}</span>
                <StatusBadge status={item.status} />
              </div>
              <p className="mt-1 text-sm text-ink-600">
                {item.productName} · {item.color} · {item.size} · {t('common.quantity')} {item.quantity}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                {formatDate(item.createdAt)} · {t('account.nav')}{' '}
                <Link to={`/account/orders/${item.orderId}`} className="text-brand-600 hover:underline">
                  {item.orderNumber}
                </Link>
                {item.reason ? ` · ${item.reason}` : ''}
              </p>
            </div>
            <span className="text-sm font-medium text-ink-900">{formatMoney(item.refundAmount)}</span>
          </li>
        ))}
      </ul>
      <Pagination meta={returns.data.meta} onPageChange={setPage} />
    </Card>
  );
}
