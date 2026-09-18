import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { InventoryApi } from '@/api/inventory.api';
import { Button, ErrorBanner, Field, Input, Modal, Select, Textarea, useErrorMessage, useToast } from '@/components/ui';
import { useT } from '@/i18n';

type Mode = 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'DAMAGE' | 'SET';

/**
 * Stock adjustments always go through the backend inventory service, which records an
 * inventory transaction and an audit entry. Nothing here writes to stock directly, and
 * the backend refuses any change that would take a variant below zero.
 */
export function AdjustStockDialog({
  open,
  onClose,
  variantId,
  label,
  currentQuantity,
}: {
  open: boolean;
  onClose: () => void;
  variantId: number | null;
  label: string;
  currentQuantity: number;
}) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const MODES: { value: Mode; label: string }[] = [
    { value: 'ADJUSTMENT_IN', label: t('admin.inventory.adjustDialog.addStock') },
    { value: 'ADJUSTMENT_OUT', label: t('admin.inventory.adjustDialog.removeStock') },
    { value: 'DAMAGE', label: t('admin.inventory.adjustDialog.writeOff') },
    { value: 'SET', label: t('admin.inventory.adjustDialog.setExact') },
  ];
  const toast = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('ADJUSTMENT_IN');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setMode('ADJUSTMENT_IN');
      setQuantity('');
      setNote('');
    }
  }, [open]);

  const adjust = useMutation({
    mutationFn: () => {
      const amount = Number(quantity);
      if (!variantId) throw new Error('No variant selected');
      return InventoryApi.adjust(
        mode === 'SET'
          ? { variantId, setQuantity: amount, note: note.trim() || undefined }
          : { variantId, type: mode, quantity: amount, note: note.trim() || undefined },
      );
    },
    onSuccess: async (result) => {
      toast.success(
        t('admin.inventory.adjustDialog.updated', { from: result.previousQuantity, to: result.quantity }),
      );
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const amount = Number(quantity);
  const valid = Number.isFinite(amount) && (mode === 'SET' ? amount >= 0 : amount > 0);

  const preview =
    !valid || mode === 'SET'
      ? null
      : mode === 'ADJUSTMENT_IN'
        ? currentQuantity + amount
        : currentQuantity - amount;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('admin.inventory.adjustStock')}
      description={label}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={adjust.isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => adjust.mutate()} loading={adjust.isPending} disabled={!valid}>
            {t('admin.inventory.adjustDialog.apply')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {adjust.isError && <ErrorBanner error={adjust.error} />}

        <p className="rounded-md bg-ink-50 px-3 py-2 text-sm text-ink-600">
          {t('admin.inventory.adjustDialog.currentStock', { count: currentQuantity })}
        </p>

        <Field label={t('admin.inventory.adjustDialog.adjustmentType')} required>
          {(props) => (
            <Select {...props} value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              {MODES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          label={mode === 'SET' ? t('admin.inventory.adjustDialog.newQuantity') : t('common.quantity')}
          required
          hint={
            preview !== null
              ? preview < 0
                ? t('admin.inventory.adjustDialog.willBeRejected', { count: preview })
                : t('admin.inventory.adjustDialog.willBe', { count: preview })
              : undefined
          }
        >
          {(props) => (
            <Input
              {...props}
              type="number"
              min={mode === 'SET' ? 0 : 1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="tabular-nums"
              placeholder="0"
            />
          )}
        </Field>

        <Field label={t('common.note')} hint={t('admin.inventory.adjustDialog.noteHint')}>
          {(props) => (
            <Textarea
              {...props}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder={t('admin.inventory.adjustDialog.notePlaceholder')}
            />
          )}
        </Field>
      </div>
    </Modal>
  );
}
