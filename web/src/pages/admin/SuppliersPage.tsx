import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { SuppliersApi } from '@/api/suppliers.api';
import { PurchasesApi } from '@/api/purchases.api';
import { qk } from '@/lib/queryClient';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Modal,
  Pagination,
  StatusBadge,
  TableWrap,
  Textarea,
  THead,
  TH,
  TBody,
  TR,
  TD,
  useErrorMessage,
  useToast,
} from '@/components/ui';
import type { Supplier } from '@/api/types';
import { useT } from '@/i18n';

const EMPTY = { name: '', phone: '', address: '', notes: '' };

export default function SuppliersPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [toDeactivate, setToDeactivate] = useState<Supplier | null>(null);
  const [historyFor, setHistoryFor] = useState<Supplier | null>(null);

  const query = { page, limit: 20, search: search || undefined };
  const suppliers = useQuery({
    queryKey: qk.admin.suppliers(query),
    queryFn: () => SuppliersApi.list(query),
    placeholderData: keepPreviousData,
  });

  const history = useQuery({
    queryKey: qk.admin.purchases({ supplierId: historyFor?.id, limit: 10 }),
    queryFn: () => PurchasesApi.list({ supplierId: historyFor!.id, limit: 10 }),
    enabled: Boolean(historyFor),
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
      };
      return editing ? SuppliersApi.update(editing.id, payload) : SuppliersApi.create(payload);
    },
    onSuccess: async () => {
      toast.success(editing ? t('admin.suppliers.updated') : t('admin.suppliers.created'));
      closeDialog();
      await queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const deactivate = useMutation({
    mutationFn: (supplier: Supplier) => SuppliersApi.remove(supplier.id),
    onSuccess: async () => {
      toast.success(t('admin.suppliers.deactivated'));
      setToDeactivate(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers'] });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      setToDeactivate(null);
    },
  });

  function openCreate() {
    setForm(EMPTY);
    setEditing(null);
    setCreating(true);
  }

  function openEdit(supplier: Supplier) {
    setForm({
      name: supplier.name,
      phone: supplier.phone ?? '',
      address: supplier.address ?? '',
      notes: supplier.notes ?? '',
    });
    setEditing(supplier);
    setCreating(false);
  }

  function closeDialog() {
    setCreating(false);
    setEditing(null);
    setForm(EMPTY);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-600">
          {suppliers.isSuccess ? t('admin.suppliers.count', { count: suppliers.data.meta.total }) : t('common.loading')}
        </p>
        <Button onClick={openCreate}>{t('admin.suppliers.addSupplier')}</Button>
      </div>

      <Card>
        <div className="border-b border-ink-200 p-4">
          <label htmlFor="supplier-search" className="sr-only">
            {t('admin.suppliers.searchLabel')}
          </label>
          <Input
            id="supplier-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('admin.suppliers.searchPlaceholder')}
            className="max-w-sm"
          />
        </div>

        {suppliers.isLoading && <LoadingState label={t('admin.suppliers.loading')} />}
        {suppliers.isError && <ErrorState error={suppliers.error} onRetry={() => void suppliers.refetch()} />}

        {suppliers.isSuccess && suppliers.data.items.length === 0 && (
          <EmptyState
            title={t('admin.suppliers.empty')}
            description={t('admin.suppliers.emptyBody')}
            action={<Button onClick={openCreate}>{t('admin.suppliers.addSupplier')}</Button>}
          />
        )}

        {suppliers.isSuccess && suppliers.data.items.length > 0 && (
          <>
            <TableWrap>
              <THead>
                <TR>
                  <TH>{t('common.name')}</TH>
                  <TH>{t('common.phone')}</TH>
                  <TH>{t('common.address')}</TH>
                  <TH align="right">{t('admin.suppliers.purchases')}</TH>
                  <TH>{t('common.status')}</TH>
                  <TH align="right">{t('common.actions')}</TH>
                </TR>
              </THead>
              <TBody>
                {suppliers.data.items.map((supplier) => (
                  <TR key={supplier.id}>
                    <TD className="font-medium text-ink-900">{supplier.name}</TD>
                    <TD className="text-ink-600">{supplier.phone ?? '—'}</TD>
                    <TD className="max-w-56 truncate text-ink-600">{supplier.address ?? '—'}</TD>
                    <TD align="right" className="tabular-nums">
                      {formatNumber(supplier.purchaseCount ?? 0)}
                    </TD>
                    <TD>
                      {supplier.active ? (
                        <Badge tone="success">{t('admin.products.active')}</Badge>
                      ) : (
                        <Badge tone="neutral">{t('admin.products.inactive')}</Badge>
                      )}
                    </TD>
                    <TD align="right">
                      <div className="flex justify-end gap-2 whitespace-nowrap">
                        <button type="button" onClick={() => setHistoryFor(supplier)} className="text-sm text-ink-600 hover:underline">
                          {t('admin.suppliers.history')}
                        </button>
                        <button type="button" onClick={() => openEdit(supplier)} className="text-sm text-brand-600 hover:underline">
                          {t('common.edit')}
                        </button>
                        {supplier.active && (
                          <button type="button" onClick={() => setToDeactivate(supplier)} className="text-sm text-danger-600 hover:underline">
                            {t('common.deactivate')}
                          </button>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
            <Pagination meta={suppliers.data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>

      {/* Create / edit */}
      <Modal
        open={creating || Boolean(editing)}
        onClose={closeDialog}
        title={editing ? t('admin.suppliers.editTitle', { name: editing.name }) : t('admin.suppliers.addSupplier')}
        footer={
          <>
            <Button variant="secondary" onClick={closeDialog} disabled={save.isPending}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!form.name.trim()}>
              {editing ? t('common.saveChanges') : t('admin.suppliers.createSupplier')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {save.isError && <ErrorBanner error={save.error} />}
          <Field label={t('common.name')} required>
            {(props) => <Input {...props} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
          </Field>
          <Field label={t('common.phone')}>
            {(props) => (
              <Input {...props} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            )}
          </Field>
          <Field label={t('common.address')}>
            {(props) => <Input {...props} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />}
          </Field>
          <Field label={t('common.notes')}>
            {(props) => (
              <Textarea {...props} rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            )}
          </Field>
        </div>
      </Modal>

      {/* Purchase history */}
      <Modal
        open={Boolean(historyFor)}
        onClose={() => setHistoryFor(null)}
        title={historyFor ? t('admin.suppliers.historyTitle', { name: historyFor.name }) : ''}
        size="lg"
      >
        {history.isLoading && <LoadingState label={t('admin.suppliers.loadingPurchases')} />}
        {history.isSuccess && history.data.items.length === 0 && (
          <EmptyState title={t('admin.suppliers.noPurchases')} description={t('admin.suppliers.noPurchasesBody')} />
        )}
        {history.isSuccess && history.data.items.length > 0 && (
          <TableWrap className="rounded-md border border-ink-200">
            <THead>
              <TR>
                <TH>{t('admin.purchases.purchase')}</TH>
                <TH>{t('common.status')}</TH>
                <TH align="right">{t('common.units')}</TH>
                <TH align="right">{t('common.cost')}</TH>
                <TH>{t('common.date')}</TH>
              </TR>
            </THead>
            <TBody>
              {history.data.items.map((purchase) => (
                <TR key={purchase.id}>
                  <TD className="font-mono text-xs">{purchase.purchaseNumber}</TD>
                  <TD>
                    <StatusBadge status={purchase.status} />
                  </TD>
                  <TD align="right" className="tabular-nums">
                    {formatNumber(purchase.itemCount)}
                  </TD>
                  <TD align="right" className="tabular-nums">
                    {formatMoney(purchase.totalCost)}
                  </TD>
                  <TD className="whitespace-nowrap text-xs text-ink-500">{formatDate(purchase.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(toDeactivate)}
        onClose={() => setToDeactivate(null)}
        onConfirm={() => toDeactivate && deactivate.mutate(toDeactivate)}
        loading={deactivate.isPending}
        title={t('admin.suppliers.deactivateTitle')}
        message={t('admin.suppliers.deactivateBody', { name: toDeactivate?.name ?? '' })}
        confirmLabel={t('common.deactivate')}
      />
    </div>
  );
}
