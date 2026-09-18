import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OrdersApi } from '@/api/orders.api';
import { qk } from '@/lib/queryClient';
import { formatDateTime, formatMoney } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  ErrorState,
  LoadingState,
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
import type { OrderStatus } from '@/api/types';
import { useT } from '@/i18n';

/**
 * Allowed status transitions, mirroring the backend's table. The backend re-validates
 * every transition, so this only keeps the UI from offering moves that would be refused.
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'PAID', 'COMPLETED', 'CANCELLED'],
  CONFIRMED: ['PAID', 'COMPLETED', 'CANCELLED'],
  PAID: ['COMPLETED', 'CANCELLED', 'REFUNDED'],
  COMPLETED: ['REFUNDED', 'CANCELLED'],
  CANCELLED: [],
  REFUNDED: [],
};

export default function SaleDetailPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const { id } = useParams();
  const orderId = Number(id);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [nextStatus, setNextStatus] = useState<OrderStatus | ''>('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);

  const order = useQuery({
    queryKey: qk.admin.order(orderId),
    queryFn: () => OrdersApi.get(orderId),
    enabled: Number.isFinite(orderId) && orderId > 0,
  });

  const changeStatus = useMutation({
    mutationFn: (status: OrderStatus) => OrdersApi.updateStatus(orderId, status),
    onSuccess: async () => {
      toast.success(t('admin.sales.statusUpdated'));
      setNextStatus('');
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const cancelOrder = useMutation({
    mutationFn: () => OrdersApi.cancel(orderId, t('admin.sales.cancelReason')),
    onSuccess: async () => {
      toast.success(t('admin.sales.cancelled'));
      setConfirmCancel(false);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      setConfirmCancel(false);
    },
  });

  if (order.isLoading) return <LoadingState label={t('admin.sales.loadingOrder')} />;
  if (order.isError || !order.data) return <ErrorState error={order.error} title={t('admin.sales.notFound')} />;

  const data = order.data;
  const allowed = TRANSITIONS[data.status] ?? [];
  const returnable = ['PAID', 'COMPLETED'].includes(data.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/admin/sales" className="text-sm text-brand-600 hover:underline">
            {t('admin.sales.backToSales')}
          </Link>
          <h2 className="mt-2 font-mono text-lg font-semibold text-ink-900">{data.orderNumber}</h2>
          <p className="mt-1 text-sm text-ink-500">
            {formatDateTime(data.createdAt)} ·{' '}
            {t('admin.sales.createdBy', { name: data.createdBy?.name ?? t('admin.sales.system') })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={data.source} />
          <StatusBadge status={data.status} />
          <StatusBadge status={data.paymentStatus} />
          {data.stockCommitted && <Badge tone="brand">{t('admin.sales.stockCommitted')}</Badge>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader title={t('common.items')} />
          <TableWrap>
            <THead>
              <TR>
                <TH>{t('common.product')}</TH>
                <TH>{t('common.sku')}</TH>
                <TH>{t('common.colour')}</TH>
                <TH>{t('common.size')}</TH>
                <TH align="right">{t('admin.pos.receipt.qty')}</TH>
                <TH align="right">{t('admin.sales.unitPrice')}</TH>
                <TH align="right">{t('common.total')}</TH>
              </TR>
            </THead>
            <TBody>
              {data.items.map((item) => (
                <TR key={item.id}>
                  <TD className="font-medium text-ink-900">{item.productName}</TD>
                  <TD className="font-mono text-xs">{item.sku}</TD>
                  <TD>{item.color}</TD>
                  <TD>{item.size}</TD>
                  <TD align="right" className="tabular-nums">
                    {item.quantity}
                  </TD>
                  <TD align="right" className="tabular-nums">
                    {formatMoney(item.unitPrice)}
                  </TD>
                  <TD align="right" className="tabular-nums font-medium text-ink-900">
                    {formatMoney(item.total)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          <CardBody className="border-t border-ink-200 bg-ink-50/60">
            <dl className="ml-auto max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-600">{t('common.subtotal')}</dt>
                <dd className="tabular-nums text-ink-900">{formatMoney(data.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-600">{t('common.discount')}</dt>
                <dd className="tabular-nums text-ink-900">−{formatMoney(data.discount)}</dd>
              </div>
              <div className="flex justify-between border-t border-ink-200 pt-1.5 text-base">
                <dt className="font-semibold text-ink-900">{t('common.total')}</dt>
                <dd className="font-semibold tabular-nums text-ink-900">{formatMoney(data.total)}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t('admin.sales.customerSection')} />
            <CardBody className="space-y-2 text-sm">
              {data.customer ? (
                <>
                  <p className="font-medium text-ink-900">
                    <Link to={`/admin/customers/${data.customer.id}`} className="hover:text-brand-600">
                      {data.customer.name}
                    </Link>
                  </p>
                  <p className="text-ink-600">{data.customer.email}</p>
                  {data.customer.phone && <p className="text-ink-600">{data.customer.phone}</p>}
                </>
              ) : (
                <>
                  <p className="font-medium text-ink-900">{data.customerName ?? t('admin.sales.walkIn')}</p>
                  {data.customerPhone && <p className="text-ink-600">{data.customerPhone}</p>}
                </>
              )}
              {data.paymentMethod && (
                <p className="pt-2 text-ink-600">
                  {t('admin.sales.paymentMethodLabel', { method: data.paymentMethod })}
                </p>
              )}
              {data.note && <p className="pt-2 text-ink-600">{t('admin.sales.noteLabel', { note: data.note })}</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t('admin.sales.actions')} />
            <CardBody className="space-y-3">
              {allowed.length > 0 ? (
                <div className="flex gap-2">
                  <label htmlFor="next-status" className="sr-only">
                    {t('admin.sales.changeStatusLabel')}
                  </label>
                  <Select
                    id="next-status"
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value as OrderStatus | '')}
                  >
                    <option value="">{t('admin.sales.changeStatus')}</option>
                    {allowed.map((status) => (
                      <option key={status} value={status}>
                        {t(`orderStatus.${status}`)}
                      </option>
                    ))}
                  </Select>
                  <Button
                    disabled={!nextStatus}
                    loading={changeStatus.isPending}
                    onClick={() => nextStatus && changeStatus.mutate(nextStatus)}
                  >
                    {t('common.apply')}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-ink-500">{t('admin.sales.finalStatus')}</p>
              )}

              {returnable && (
                <Button variant="secondary" fullWidth onClick={() => setReturnOpen(true)}>
                  {t('admin.sales.processReturn')}
                </Button>
              )}

              {allowed.includes('CANCELLED') && (
                <Button variant="secondary" fullWidth onClick={() => setConfirmCancel(true)}>
                  {t('admin.sales.cancelOrder')}
                </Button>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => cancelOrder.mutate()}
        loading={cancelOrder.isPending}
        title={t('admin.sales.cancelTitle')}
        message={t('admin.sales.cancelBody')}
        confirmLabel={t('admin.sales.cancelOrder')}
      />

      <CreateReturnDialog open={returnOpen} onClose={() => setReturnOpen(false)} orderId={orderId} />
    </div>
  );
}
