import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { CustomerApi } from '@/api/customer.api';
import { qk } from '@/lib/queryClient';
import { formatDate, formatMoney } from '@/lib/format';
import { Card, EmptyState, ErrorState, LinkButton, LoadingState, Pagination, StatusBadge } from '@/components/ui';
import { useT } from '@/i18n';

export default function OrdersPage() {
  const t = useT();
  const [page, setPage] = useState(1);
  const query = { page, limit: 10 };

  const orders = useQuery({
    queryKey: qk.customer.orders(query),
    queryFn: () => CustomerApi.listOrders(query),
    placeholderData: keepPreviousData,
  });

  if (orders.isLoading) return <LoadingState label={t('account.loadingOrders')} />;
  if (orders.isError || !orders.data) return <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />;

  if (orders.data.items.length === 0) {
    return (
      <EmptyState
        title={t('account.ordersEmpty')}
        description={t('account.ordersEmptyBody')}
        action={<LinkButton to="/shop">{t('home.shopShirts')}</LinkButton>}
      />
    );
  }

  return (
    <Card>
      <ul className="divide-y divide-ink-100">
        {orders.data.items.map((order) => (
          <li key={order.id}>
            <Link
              to={`/account/orders/${order.id}`}
              className="flex flex-col gap-3 p-5 transition-colors hover:bg-ink-50/70 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-ink-900">{order.orderNumber}</span>
                  <StatusBadge status={order.status} />
                </div>
                <p className="mt-1 text-sm text-ink-500">
                  {formatDate(order.createdAt)} · {t('common.itemCount', { count: order.itemCount })}
                </p>
                <p className="mt-1 truncate text-sm text-ink-600">
                  {order.items.map((item) => `${item.productName} (${item.color}, ${item.size})`).join(', ')}
                </p>
              </div>
              <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                <span className="font-semibold text-ink-900">{formatMoney(order.total)}</span>
                <span className="text-sm text-brand-600">{t('account.viewDetails')}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <Pagination meta={orders.data.meta} onPageChange={setPage} />
    </Card>
  );
}
