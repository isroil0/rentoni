import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ReturnsApi } from '@/api/returns.api';
import { qk } from '@/lib/queryClient';
import { formatMoney } from '@/lib/format';
import {
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  LoadingState,
  Modal,
  Textarea,
  useErrorMessage,
  useToast,
} from '@/components/ui';
import { QuantitySelector } from '@/components/shop/QuantitySelector';
import { useT } from '@/i18n';

/**
 * Admin return flow: the backend supplies the eligible quantity per line, the admin
 * picks what is coming back, and accepting restores stock and writes a RETURN inventory
 * transaction in one backend transaction.
 */
export function CreateReturnDialog({
  open,
  onClose,
  orderId,
}: {
  open: boolean;
  onClose: () => void;
  orderId: number;
}) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('');

  const eligibility = useQuery({
    queryKey: qk.admin.returnEligibility(orderId),
    queryFn: () => ReturnsApi.eligibility(orderId),
    enabled: open && Number.isFinite(orderId),
  });

  useEffect(() => {
    if (open) {
      setQuantities({});
      setReason('');
    }
  }, [open]);

  const lines = (eligibility.data?.lines ?? []).filter((line) => line.eligible > 0);
  const selected = lines
    .map((line) => ({ variantId: line.variantId, quantity: quantities[line.variantId] ?? 0 }))
    .filter((line) => line.quantity > 0);

  const refundEstimate = lines.reduce(
    (sum, line) => sum + (quantities[line.variantId] ?? 0) * line.unitPrice,
    0,
  );

  const submit = useMutation({
    mutationFn: () =>
      ReturnsApi.create({
        orderId,
        items: selected,
        reason: reason.trim() || undefined,
        // Admin-recorded returns are accepted immediately and restock at once.
        autoAccept: true,
      }),
    onSuccess: async () => {
      toast.success(t('admin.returns.dialog.success'));
      onClose();
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('admin.returns.dialog.title')}
      description={t('admin.returns.dialog.body')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submit.isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => submit.mutate()} loading={submit.isPending} disabled={selected.length === 0}>
            {t('admin.returns.dialog.confirm')}
          </Button>
        </>
      }
    >
      {eligibility.isLoading && <LoadingState label={t('admin.returns.dialog.checking')} />}

      {eligibility.isSuccess && !eligibility.data.returnable && (
        <EmptyState
          title={t('admin.returns.dialog.notEligible')}
          description={t('admin.returns.dialog.notEligibleBody', {
            status: t(`orderStatus.${eligibility.data.status}`),
          })}
        />
      )}

      {eligibility.isSuccess && eligibility.data.returnable && lines.length === 0 && (
        <EmptyState title={t('admin.returns.dialog.nothingLeft')} description={t('admin.returns.dialog.nothingLeftBody')} />
      )}

      {eligibility.isSuccess && lines.length > 0 && (
        <div className="space-y-5">
          {submit.isError && <ErrorBanner error={submit.error} />}

          <ul className="divide-y divide-ink-100">
            {lines.map((line) => (
              <li key={line.variantId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">{line.productName}</p>
                  <p className="text-xs text-ink-500">
                    {line.color} · {line.size} · <span className="font-mono">{line.sku}</span>
                  </p>
                  <p className="text-xs text-ink-500">
                    {t('admin.returns.dialog.orderedLine', {
                      ordered: line.ordered,
                      returned: line.alreadyReturned,
                      eligible: line.eligible,
                    })}
                  </p>
                </div>
                <QuantitySelector
                  size="sm"
                  min={0}
                  max={line.eligible}
                  value={quantities[line.variantId] ?? 0}
                  label={t('admin.returns.dialog.quantityFor', { sku: line.sku })}
                  onChange={(quantity) => setQuantities((current) => ({ ...current, [line.variantId]: quantity }))}
                />
              </li>
            ))}
          </ul>

          <div className="flex justify-between rounded-md bg-ink-50 px-3 py-2 text-sm">
            <span className="text-ink-600">{t('admin.returns.dialog.estimatedRefund')}</span>
            <span className="font-semibold tabular-nums text-ink-900">{formatMoney(refundEstimate)}</span>
          </div>

          <Field label={t('common.reason')} hint={t('admin.returns.dialog.reasonHint')}>
            {(props) => (
              <Textarea
                {...props}
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={300}
                placeholder={t('admin.returns.dialog.reasonPlaceholder')}
              />
            )}
          </Field>
        </div>
      )}
    </Modal>
  );
}
