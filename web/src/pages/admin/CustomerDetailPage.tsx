import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CustomersApi } from '@/api/customers.api';
import { qk } from '@/lib/queryClient';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
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
import { useT } from '@/i18n';

export default function CustomerDetailPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const { id } = useParams();
  const customerId = Number(id);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirmToggle, setConfirmToggle] = useState(false);

  const customer = useQuery({
    queryKey: qk.admin.customer(customerId),
    queryFn: () => CustomersApi.get(customerId),
    enabled: Number.isFinite(customerId) && customerId > 0,
  });

  const setStatus = useMutation({
    mutationFn: (active: boolean) => CustomersApi.setStatus(customerId, active),
    onSuccess: async (updated) => {
      toast.success(
        updated.active ? t('admin.customers.reactivatedToast') : t('admin.customers.deactivatedToast'),
      );
      setConfirmToggle(false);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      setConfirmToggle(false);
    },
  });

  if (customer.isLoading) return <LoadingState label={t('admin.customers.loadingCustomer')} />;
  if (customer.isError || !customer.data) return <ErrorState error={customer.error} title={t('admin.customers.notFound')} />;

  const data = customer.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/admin/customers" className="text-sm text-brand-600 hover:underline">
            {t('admin.customers.backToCustomers')}
          </Link>
          <h2 className="mt-2 text-xl font-semibold text-ink-900">{data.name}</h2>
          <p className="mt-1 text-sm text-ink-500">
            {data.email}
            {data.phone && ` · ${data.phone}`} · {t('admin.customers.joined', { date: formatDate(data.createdAt) })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data.active ? (
            <Badge tone="success">{t('admin.customers.active')}</Badge>
          ) : (
            <Badge tone="neutral">{t('admin.customers.deactivated')}</Badge>
          )}
          <Button variant="secondary" onClick={() => setConfirmToggle(true)}>
            {data.active ? t('common.deactivate') : t('common.reactivate')}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-sm text-ink-500">{t('common.orders')}</p>
            <p className="mt-1 text-2xl font-semibold text-ink-900">{formatNumber(data.orderCount)}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-sm text-ink-500">{t('admin.customers.totalSpent')}</p>
            <p className="mt-1 text-2xl font-semibold text-ink-900">{formatMoney(data.totalSpent)}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-sm text-ink-500">{t('admin.customers.accountStatus')}</p>
            <p className="mt-1 text-2xl font-semibold text-ink-900">
              {data.active ? t('admin.customers.active') : t('admin.customers.deactivated')}
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title={t('admin.customers.recentOrders')} description={t('admin.customers.recentOrdersBody')} />
        {data.recentOrders.length === 0 ? (
          <EmptyState title={t('admin.customers.noOrders')} description={t('admin.customers.noOrdersBody')} />
        ) : (
          <TableWrap>
            <THead>
              <TR>
                <TH>{t('admin.dashboard.order')}</TH>
                <TH align="right">{t('common.total')}</TH>
                <TH>{t('common.payment')}</TH>
                <TH>{t('common.status')}</TH>
                <TH>{t('common.date')}</TH>
              </TR>
            </THead>
            <TBody>
              {data.recentOrders.map((order) => (
                <TR key={order.id}>
                  <TD>
                    <Link to={`/admin/sales/${order.id}`} className="font-mono text-xs font-medium text-ink-900 hover:text-brand-600">
                      {order.orderNumber}
                    </Link>
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
        )}
      </Card>

      <ConfirmDialog
        open={confirmToggle}
        onClose={() => setConfirmToggle(false)}
        onConfirm={() => setStatus.mutate(!data.active)}
        loading={setStatus.isPending}
        tone={data.active ? 'danger' : 'primary'}
        title={data.active ? t('admin.customers.deactivateTitle') : t('admin.customers.reactivateTitle')}
        message={data.active ? t('admin.customers.deactivateBody') : t('admin.customers.reactivateBody')}
        confirmLabel={data.active ? t('common.deactivate') : t('common.reactivate')}
      />
    </div>
  );
}
