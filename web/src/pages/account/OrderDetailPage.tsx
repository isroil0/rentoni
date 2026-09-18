import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CustomerApi } from '@/api/customer.api';
import { qk } from '@/lib/queryClient';
import { formatDateTime, formatMoney } from '@/lib/format';
import {
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  ErrorState,
  LoadingState,
  StatusBadge,
  useErrorMessage,
  useToast,
} from '@/components/ui';
import { ProductImage } from '@/components/shop/ProductImage';
import { RequestReturnDialog } from './RequestReturnDialog';
import { useT } from '@/i18n';

export default function OrderDetailPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const { id } = useParams();
  const orderId = Number(id);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);

  const order = useQuery({
    queryKey: qk.customer.order(orderId),
    queryFn: () => CustomerApi.getOrder(orderId),
    enabled: Number.isFinite(orderId) && orderId > 0,
  });

  /**
   * Whether the order can be cancelled or returned is decided by the backend. The UI
   * asks the eligibility endpoint and reflects the answer — it never re-implements the
   * rules, and a failed attempt surfaces the backend's reason.
   */
  const eligibility = useQuery({
    queryKey: qk.customer.eligibility(orderId),
    queryFn: () => CustomerApi.returnEligibility(orderId),
    enabled: Number.isFinite(orderId) && orderId > 0,
    retry: false,
  });

  const cancelOrder = useMutation({
    mutationFn: () => CustomerApi.cancelOrder(orderId, t('account.cancelReason')),
    onSuccess: async () => {
      toast.success(t('account.cancelled'));
      setConfirmCancel(false);
      await queryClient.invalidateQueries({ queryKey: ['customer'] });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      setConfirmCancel(false);
      void order.refetch();
    },
  });

  if (order.isLoading) return <LoadingState label={t('account.loadingOrder')} />;
  if (order.isError || !order.data) return <ErrorState error={order.error} title={t('account.orderNotFound')} />;

  const data = order.data;
  const cancellable = ['PENDING', 'CONFIRMED', 'PAID'].includes(data.status);
  const returnable = eligibility.data?.returnable === true && (eligibility.data?.lines ?? []).some((l) => l.eligible > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/account/orders" className="text-sm text-brand-600 hover:underline">
            {t('account.backToOrders')}
          </Link>
          <h2 className="mt-2 font-mono text-lg font-semibold text-ink-900">{data.orderNumber}</h2>
          <p className="mt-0.5 text-sm text-ink-500">{t('account.placedOn', { date: formatDateTime(data.createdAt) })}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={data.status} />
          <StatusBadge status={data.paymentStatus} />
        </div>
      </div>

      <Card>
        <ul className="divide-y divide-ink-100">
          {data.items.map((item) => (
            <li key={item.id} className="flex gap-4 p-5">
              <ProductImage image={null} alt={item.productName} className="h-20 w-16 shrink-0 rounded-md border border-ink-200" />
              <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-ink-900">{item.productName}</p>
                  <p className="mt-0.5 text-sm text-ink-500">
                    {item.color} · {item.size}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-500">
                    {formatMoney(item.unitPrice)} × {item.quantity}
                  </p>
                </div>
                <span className="font-semibold text-ink-900">{formatMoney(item.total)}</span>
              </div>
            </li>
          ))}
        </ul>

        <CardBody className="border-t border-ink-200 bg-ink-50/60">
          <dl className="ml-auto max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-600">{t('common.subtotal')}</dt>
              <dd className="text-ink-900">{formatMoney(data.subtotal)}</dd>
            </div>
            {data.discount > 0 && (
              <div className="flex justify-between">
                <dt className="text-ink-600">{t('common.discount')}</dt>
                <dd className="text-success-700">−{formatMoney(data.discount)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-ink-200 pt-2 text-base">
              <dt className="font-semibold text-ink-900">{t('common.total')}</dt>
              <dd className="font-semibold text-ink-900">{formatMoney(data.total)}</dd>
            </div>
            {data.paymentMethod && (
              <div className="flex justify-between pt-1">
                <dt className="text-ink-600">{t('common.payment')}</dt>
                <dd className="text-ink-900">{data.paymentMethod}</dd>
              </div>
            )}
          </dl>
        </CardBody>
      </Card>

      {data.note && (
        <Card>
          <CardBody>
            <h3 className="text-sm font-semibold text-ink-900">{t('checkout.orderNote')}</h3>
            <p className="mt-1 text-sm text-ink-600">{data.note}</p>
          </CardBody>
        </Card>
      )}

      {(cancellable || returnable) && (
        <div className="flex flex-wrap gap-3">
          {cancellable && (
            <Button variant="secondary" onClick={() => setConfirmCancel(true)}>
              {t('account.cancelOrder')}
            </Button>
          )}
          {returnable && (
            <Button variant="secondary" onClick={() => setReturnOpen(true)}>
              {t('account.requestReturn')}
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => cancelOrder.mutate()}
        loading={cancelOrder.isPending}
        title={t('account.cancelTitle')}
        message={t('account.cancelBody')}
        confirmLabel={t('account.cancelOrder')}
      />

      {eligibility.data && (
        <RequestReturnDialog
          open={returnOpen}
          onClose={() => setReturnOpen(false)}
          eligibility={eligibility.data}
          orderId={orderId}
        />
      )}
    </div>
  );
}
