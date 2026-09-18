import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PurchasesApi } from '@/api/purchases.api';
import { qk } from '@/lib/queryClient';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
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

export default function PurchaseDetailPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const { id } = useParams();
  const purchaseId = Number(id);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirmReceive, setConfirmReceive] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const purchase = useQuery({
    queryKey: qk.admin.purchase(purchaseId),
    queryFn: () => PurchasesApi.get(purchaseId),
    enabled: Number.isFinite(purchaseId) && purchaseId > 0,
  });

  /**
   * Receiving is a backend transaction: every line increases stock and writes a PURCHASE
   * inventory transaction, then the purchase flips to RECEIVED. The backend refuses a
   * second receive, so the worst a double-click can do is show that error.
   */
  const receive = useMutation({
    mutationFn: () => PurchasesApi.receive(purchaseId),
    onSuccess: async (updated) => {
      toast.success(t('admin.purchases.receivedToast', { count: formatNumber(updated.itemCount) }));
      setConfirmReceive(false);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      setConfirmReceive(false);
      void purchase.refetch();
    },
  });

  const cancel = useMutation({
    mutationFn: () => PurchasesApi.cancel(purchaseId, t('admin.sales.cancelReason')),
    onSuccess: async () => {
      toast.success(t('admin.purchases.cancelled'));
      setConfirmCancel(false);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      setConfirmCancel(false);
    },
  });

  if (purchase.isLoading) return <LoadingState label={t('admin.purchases.loadingPurchase')} />;
  if (purchase.isError || !purchase.data) return <ErrorState error={purchase.error} title={t('admin.purchases.notFound')} />;

  const data = purchase.data;
  const isDraft = data.status === 'DRAFT';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/admin/purchases" className="text-sm text-brand-600 hover:underline">
            {t('admin.purchases.backToPurchases')}
          </Link>
          <h2 className="mt-2 font-mono text-lg font-semibold text-ink-900">{data.purchaseNumber}</h2>
          <p className="mt-1 text-sm text-ink-500">
            {data.supplier.name} · {t('admin.purchases.createdOn', { date: formatDateTime(data.createdAt) })}
            {data.receivedAt && ` · ${t('admin.purchases.receivedOn', { date: formatDateTime(data.receivedAt) })}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={data.status} />
          {isDraft && (
            <>
              <Button variant="secondary" onClick={() => setConfirmCancel(true)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={() => setConfirmReceive(true)}>{t('admin.purchases.receivePurchase')}</Button>
            </>
          )}
        </div>
      </div>

      {data.status === 'RECEIVED' && (
        <div className="rounded-md border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">
          {t('admin.purchases.receivedBanner')}
        </div>
      )}

      <Card>
        <CardHeader title={t('common.items')} description={t('common.itemCount', { count: data.itemCount })} />
        <TableWrap>
          <THead>
            <TR>
              <TH>{t('common.product')}</TH>
              <TH>{t('common.sku')}</TH>
              <TH>{t('common.colour')}</TH>
              <TH>{t('common.size')}</TH>
              <TH align="right">{t('common.quantity')}</TH>
              <TH align="right">{t('admin.purchases.unitCost')}</TH>
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
                  {formatNumber(item.quantity)}
                </TD>
                <TD align="right" className="tabular-nums">
                  {formatMoney(item.unitCost)}
                </TD>
                <TD align="right" className="tabular-nums font-medium text-ink-900">
                  {formatMoney(item.total)}
                </TD>
              </TR>
            ))}
          </TBody>
        </TableWrap>
        <CardBody className="border-t border-ink-200 bg-ink-50/60">
          <div className="ml-auto flex max-w-xs justify-between text-base">
            <span className="font-semibold text-ink-900">{t('admin.purchases.totalCost')}</span>
            <span className="font-semibold tabular-nums text-ink-900">{formatMoney(data.totalCost)}</span>
          </div>
        </CardBody>
      </Card>

      {data.note && (
        <Card>
          <CardBody>
            <h3 className="text-sm font-semibold text-ink-900">{t('common.note')}</h3>
            <p className="mt-1 text-sm text-ink-600">{data.note}</p>
          </CardBody>
        </Card>
      )}

      <ConfirmDialog
        open={confirmReceive}
        onClose={() => setConfirmReceive(false)}
        onConfirm={() => receive.mutate()}
        loading={receive.isPending}
        tone="primary"
        title={t('admin.purchases.receiveTitle')}
        message={t('admin.purchases.receiveBody', { count: formatNumber(data.itemCount) })}
        confirmLabel={t('admin.purchases.receivePurchase')}
      />

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => cancel.mutate()}
        loading={cancel.isPending}
        title={t('admin.purchases.cancelTitle')}
        message={t('admin.purchases.cancelBody')}
        confirmLabel={t('admin.purchases.cancelAction')}
      />
    </div>
  );
}
