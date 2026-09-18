import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CustomerApi } from '@/api/customer.api';
import { Button, ErrorBanner, Field, Modal, Textarea, useErrorMessage, useToast } from '@/components/ui';
import { QuantitySelector } from '@/components/shop/QuantitySelector';
import type { ReturnEligibility } from '@/api/types';
import { useT } from '@/i18n';

/**
 * Return request. The eligible quantity per line comes from the backend; the stepper is
 * capped to it, and the backend re-validates on submit regardless.
 */
export function RequestReturnDialog({
  open,
  onClose,
  eligibility,
  orderId,
}: {
  open: boolean;
  onClose: () => void;
  eligibility: ReturnEligibility;
  orderId: number;
}) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('');

  const lines = eligibility.lines.filter((line) => line.eligible > 0);
  const selected = lines
    .map((line) => ({ variantId: line.variantId, quantity: quantities[line.variantId] ?? 0 }))
    .filter((line) => line.quantity > 0);

  const submit = useMutation({
    mutationFn: () =>
      CustomerApi.requestReturn({
        orderId,
        items: selected,
        reason: reason.trim() || undefined,
      }),
    onSuccess: async () => {
      toast.success(t('account.returnDialog.success'));
      setQuantities({});
      setReason('');
      onClose();
      await queryClient.invalidateQueries({ queryKey: ['customer'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('account.returnDialog.title')}
      description={t('account.returnDialog.body')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submit.isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => submit.mutate()} loading={submit.isPending} disabled={selected.length === 0}>
            {t('account.returnDialog.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {submit.isError && <ErrorBanner error={submit.error} />}

        <ul className="divide-y divide-ink-100">
          {lines.map((line) => (
            <li key={line.variantId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900">{line.productName}</p>
                <p className="text-xs text-ink-500">
                  {line.color} · {line.size} · {t('account.returnDialog.eligible', { count: line.eligible })}
                </p>
              </div>
              <QuantitySelector
                size="sm"
                min={0}
                max={line.eligible}
                value={quantities[line.variantId] ?? 0}
                label={t('account.returnDialog.quantityFor', { name: line.productName })}
                onChange={(quantity) => setQuantities((current) => ({ ...current, [line.variantId]: quantity }))}
              />
            </li>
          ))}
        </ul>

        <Field label={t('common.reason')} hint={t('account.returnDialog.reasonHint')}>
          {(props) => (
            <Textarea
              {...props}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              placeholder={t('account.returnDialog.reasonPlaceholder')}
            />
          )}
        </Field>
      </div>
    </Modal>
  );
}
