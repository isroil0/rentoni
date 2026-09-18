import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminCatalogApi } from '@/api/adminCatalog.api';
import { qk } from '@/lib/queryClient';
import { ApiError } from '@/lib/apiClient';
import { Button, Checkbox, ErrorBanner, Field, Input, Modal, useErrorMessage, useToast } from '@/components/ui';
import type { AdminVariant } from '@/api/types';
import { useT } from '@/i18n';

const EMPTY = {
  sku: '',
  barcode: '',
  color: '',
  size: '',
  costPrice: '',
  sellingPrice: '',
  minimumStock: '5',
  initialStock: '0',
  active: true,
};

/** Create or edit a single variant. Duplicate SKU/barcode/combination is caught by the backend. */
export function VariantDialog({
  open,
  onClose,
  productId,
  variant,
}: {
  open: boolean;
  onClose: () => void;
  productId: number;
  variant: AdminVariant | null;
}) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const isEdit = Boolean(variant);

  useEffect(() => {
    if (variant) {
      setForm({
        sku: variant.sku,
        barcode: variant.barcode ?? '',
        color: variant.color,
        size: variant.size,
        costPrice: String(variant.costPrice),
        sellingPrice: String(variant.sellingPrice),
        minimumStock: String(variant.minimumStock),
        initialStock: '0',
        active: variant.active,
      });
    } else {
      setForm(EMPTY);
    }
  }, [variant, open]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        sku: form.sku.trim(),
        barcode: form.barcode.trim() || null,
        color: form.color.trim(),
        size: form.size.trim(),
        costPrice: Number(form.costPrice) || 0,
        sellingPrice: Number(form.sellingPrice) || 0,
        minimumStock: Number(form.minimumStock) || 0,
        active: form.active,
      };
      if (variant) return AdminCatalogApi.updateVariant(variant.id, payload);
      return AdminCatalogApi.createVariant(productId, {
        ...payload,
        initialStock: Number(form.initialStock) || 0,
      });
    },
    onSuccess: async () => {
      toast.success(isEdit ? t('admin.variants.updated') : t('admin.variants.created'));
      await queryClient.invalidateQueries({ queryKey: qk.admin.product(productId) });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const fieldErrors = save.error instanceof ApiError ? save.error.fieldErrors : {};

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t('admin.variants.editTitle', { sku: variant?.sku ?? '' }) : t('admin.variants.addVariant')}
      description={isEdit ? t('admin.variants.priceAudited') : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            {isEdit ? t('common.saveChanges') : t('admin.variants.addVariant')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {save.isError && <ErrorBanner error={save.error} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('common.sku')} required error={fieldErrors.sku}>
            {(props) => (
              <Input
                {...props}
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder="OXF-W-M"
                className="font-mono"
              />
            )}
          </Field>
          <Field label={t('common.barcode')} error={fieldErrors.barcode} hint={t('admin.variants.barcodeHint')}>
            {(props) => (
              <Input
                {...props}
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                className="font-mono"
              />
            )}
          </Field>
          <Field label={t('common.colour')} required error={fieldErrors.color}>
            {(props) => (
              <Input {...props} value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder={t('misc.examples.colour')} />
            )}
          </Field>
          <Field label={t('common.size')} required error={fieldErrors.size}>
            {(props) => (
              <Input {...props} value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} placeholder="M" />
            )}
          </Field>
          <Field label={t('admin.variants.costPrice')} required error={fieldErrors.costPrice}>
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                step="0.01"
                value={form.costPrice}
                onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
                className="tabular-nums"
              />
            )}
          </Field>
          <Field label={t('admin.variants.sellingPrice')} required error={fieldErrors.sellingPrice}>
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                step="0.01"
                value={form.sellingPrice}
                onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
                className="tabular-nums"
              />
            )}
          </Field>
          <Field label={t('admin.variants.minimumStock')} error={fieldErrors.minimumStock} hint={t('admin.variants.minimumStockHint')}>
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                value={form.minimumStock}
                onChange={(e) => setForm({ ...form, minimumStock: e.target.value })}
                className="tabular-nums"
              />
            )}
          </Field>
          {!isEdit && (
            <Field label={t('admin.variants.openingStock')} hint={t('admin.variants.openingStockHint')}>
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={0}
                  value={form.initialStock}
                  onChange={(e) => setForm({ ...form, initialStock: e.target.value })}
                  className="tabular-nums"
                />
              )}
            </Field>
          )}
        </div>

        <Checkbox
          label={t('admin.products.active')}
          checked={form.active}
          onChange={(e) => setForm({ ...form, active: e.target.checked })}
        />
      </div>
    </Modal>
  );
}
