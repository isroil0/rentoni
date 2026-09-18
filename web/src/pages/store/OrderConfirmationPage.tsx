import { Link, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CustomerApi } from '@/api/customer.api';
import { qk } from '@/lib/queryClient';
import { formatMoney } from '@/lib/format';
import { Card, CardBody, ErrorState, LinkButton, LoadingState, StatusBadge } from '@/components/ui';
import type { Order } from '@/api/types';
import { useT } from '@/i18n';

export default function OrderConfirmationPage() {
  const t = useT();
  const { id } = useParams();
  const orderId = Number(id);
  const location = useLocation();
  // The order returned by the checkout mutation renders instantly; the query confirms it.
  const seeded = (location.state as { order?: Order } | null)?.order;

  const order = useQuery({
    queryKey: qk.customer.order(orderId),
    queryFn: () => CustomerApi.getOrder(orderId),
    enabled: Number.isFinite(orderId) && orderId > 0,
    initialData: seeded?.id === orderId ? seeded : undefined,
  });

  if (order.isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <LoadingState label={t('confirmation.loading')} />
      </div>
    );
  }

  if (order.isError || !order.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <ErrorState error={order.error} title={t('account.orderNotFound')} />
      </div>
    );
  }

  const data = order.data;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-50 text-success-700">
          <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
            <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-ink-900">{t('confirmation.title')}</h1>
        <p className="mt-2 text-ink-600">{t('confirmation.body')}</p>
      </div>

      <Card className="mt-8">
        <CardBody className="space-y-5">
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-ink-500">{t('confirmation.orderNumber')}</dt>
              <dd className="mt-0.5 font-mono text-sm font-semibold text-ink-900">{data.orderNumber}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-500">{t('common.total')}</dt>
              <dd className="mt-0.5 text-sm font-semibold text-ink-900">{formatMoney(data.total)}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-500">{t('common.status')}</dt>
              <dd className="mt-0.5">
                <StatusBadge status={data.status} />
              </dd>
            </div>
          </dl>

          <div className="border-t border-ink-200 pt-4">
            <h2 className="text-sm font-semibold text-ink-900">{t('common.items')}</h2>
            <ul className="mt-3 divide-y divide-ink-100">
              {data.items.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                  <div>
                    <p className="font-medium text-ink-900">{item.productName}</p>
                    <p className="text-xs text-ink-500">
                      {item.color} · {item.size} · {t('common.quantity')} {item.quantity}
                    </p>
                  </div>
                  <span className="font-medium text-ink-900">{formatMoney(item.total)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-3 border-t border-ink-200 pt-4">
            <LinkButton to={`/account/orders/${data.id}`}>{t('confirmation.viewOrder')}</LinkButton>
            <LinkButton to="/shop" variant="secondary">
              {t('cart.continueShopping')}
            </LinkButton>
          </div>
        </CardBody>
      </Card>

      <p className="mt-6 text-center text-sm text-ink-500">
        {t('confirmation.trackPrompt')}{' '}
        <Link to="/account/orders" className="text-brand-600 hover:underline">
          {t('confirmation.trackLink')}
        </Link>
      </p>
    </div>
  );
}
