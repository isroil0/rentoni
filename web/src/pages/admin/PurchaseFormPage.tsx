import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PurchasesApi } from '@/api/purchases.api';
import { SuppliersApi } from '@/api/suppliers.api';
import { PosApi } from '@/api/pos.api';
import { qk } from '@/lib/queryClient';
import { useDebounce } from '@/hooks/useDebounce';
import { formatMoney } from '@/lib/format';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Select,
  Textarea,
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

interface DraftLine {
  variantId: number;
  sku: string;
  productName: string;
  color: string;
  size: string;
  quantity: number;
  unitCost: number;
}

/** Create a purchase order, optionally receiving it into stock in the same step. */
export default function PurchaseFormPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [supplierId, setSupplierId] = useState('');
  const [note, setNote] = useState('');
  const [receiveNow, setReceiveNow] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);

  const suppliers = useQuery({
    queryKey: qk.admin.suppliers({ limit: 100, active: true }),
    queryFn: () => SuppliersApi.list({ limit: 100, active: true }),
  });

  // Reuses the POS variant search — same lookup by name, SKU or barcode.
  const results = useQuery({
    queryKey: qk.admin.posSearch(debouncedSearch),
    queryFn: () => PosApi.search(debouncedSearch, 12),
    enabled: debouncedSearch.trim().length > 0,
  });

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0),
    [lines],
  );

  const create = useMutation({
    mutationFn: () =>
      PurchasesApi.create({
        supplierId: Number(supplierId),
        items: lines.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          unitCost: line.unitCost,
        })),
        note: note.trim() || undefined,
        receiveNow,
      }),
    onSuccess: async (purchase) => {
      toast.success(receiveNow ? t('admin.purchases.form.createdReceived') : t('admin.purchases.form.createdDraft'));
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      navigate(`/admin/purchases/${purchase.id}`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const canSubmit = Boolean(supplierId) && lines.length > 0 && lines.every((l) => l.quantity > 0);

  return (
    <div className="max-w-4xl space-y-6">
      <Card>
        <CardHeader title={t('admin.purchases.form.title')} description={t('admin.purchases.form.body')} />
        <CardBody className="space-y-4">
          {create.isError && <ErrorBanner error={create.error} />}

          <Field label={t('common.supplier')} required>
            {(props) => (
              <Select {...props} value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
                <option value="">{t('admin.purchases.form.selectSupplier')}</option>
                {(suppliers.data?.items ?? []).map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label={t('common.note')}>
            {(props) => (
              <Textarea
                {...props}
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('admin.purchases.form.notePlaceholder')}
              />
            )}
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('common.items')} description={t('admin.purchases.form.itemsBody')} />
        <CardBody className="space-y-4">
          <Field label={t('admin.purchases.form.addVariant')}>
            {(props) => (
              <Input
                {...props}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('admin.purchases.form.addPlaceholder')}
                autoComplete="off"
              />
            )}
          </Field>

          {results.isSuccess && debouncedSearch.trim() && results.data.length > 0 && (
            <ul className="max-h-56 divide-y divide-ink-100 overflow-y-auto rounded-md border border-ink-200">
              {results.data.map((result) => (
                <li key={result.variantId}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-ink-50"
                    onClick={() => {
                      setLines((current) =>
                        current.some((l) => l.variantId === result.variantId)
                          ? current
                          : [
                              ...current,
                              {
                                variantId: result.variantId,
                                sku: result.sku,
                                productName: result.productName,
                                color: result.color,
                                size: result.size,
                                quantity: 10,
                                unitCost: 0,
                              },
                            ],
                      );
                      setSearch('');
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink-900">{result.productName}</span>
                      <span className="text-xs text-ink-500">
                        {result.color} · {result.size} · <span className="font-mono">{result.sku}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-ink-500">
                      {t('admin.purchases.form.inStock', { count: result.quantity })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {lines.length === 0 ? (
            <EmptyState title={t('admin.purchases.form.noItems')} description={t('admin.purchases.form.noItemsBody')} />
          ) : (
            <TableWrap className="rounded-md border border-ink-200">
              <THead>
                <TR>
                  <TH>{t('common.product')}</TH>
                  <TH>{t('common.sku')}</TH>
                  <TH align="right">{t('common.quantity')}</TH>
                  <TH align="right">{t('admin.purchases.unitCost')}</TH>
                  <TH align="right">{t('common.total')}</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {lines.map((line, index) => (
                  <TR key={line.variantId}>
                    <TD>
                      <span className="font-medium text-ink-900">{line.productName}</span>
                      <span className="block text-xs text-ink-500">
                        {line.color} · {line.size}
                      </span>
                    </TD>
                    <TD className="font-mono text-xs">{line.sku}</TD>
                    <TD align="right">
                      <Input
                        type="number"
                        min={1}
                        value={line.quantity}
                        aria-label={t('admin.purchases.form.quantityFor', { sku: line.sku })}
                        onChange={(e) =>
                          setLines((current) =>
                            current.map((l, i) => (i === index ? { ...l, quantity: Number(e.target.value) || 0 } : l)),
                          )
                        }
                        className="h-8 w-20 text-right tabular-nums"
                      />
                    </TD>
                    <TD align="right">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.unitCost}
                        aria-label={t('admin.purchases.form.unitCostFor', { sku: line.sku })}
                        onChange={(e) =>
                          setLines((current) =>
                            current.map((l, i) => (i === index ? { ...l, unitCost: Number(e.target.value) || 0 } : l)),
                          )
                        }
                        className="h-8 w-24 text-right tabular-nums"
                      />
                    </TD>
                    <TD align="right" className="tabular-nums font-medium text-ink-900">
                      {formatMoney(line.quantity * line.unitCost)}
                    </TD>
                    <TD align="right">
                      <button
                        type="button"
                        onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                        className="text-sm text-danger-600 hover:underline"
                        aria-label={t('admin.purchases.form.removeLine', { sku: line.sku })}
                      >
                        {t('common.remove')}
                      </button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}

          {lines.length > 0 && (
            <div className="flex justify-end border-t border-ink-200 pt-4">
              <div className="flex w-56 justify-between text-base">
                <span className="font-semibold text-ink-900">{t('admin.purchases.totalCost')}</span>
                <span className="font-semibold tabular-nums text-ink-900">{formatMoney(total)}</span>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <Checkbox
            label={t('admin.purchases.form.receiveNow')}
            checked={receiveNow}
            onChange={(e) => setReceiveNow(e.target.checked)}
          />
          <div className="flex gap-3">
            <Button disabled={!canSubmit} loading={create.isPending} onClick={() => create.mutate()}>
              {receiveNow ? t('admin.purchases.form.createAndReceive') : t('admin.purchases.form.createDraft')}
            </Button>
            <Button variant="secondary" onClick={() => navigate('/admin/purchases')}>
              {t('common.cancel')}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
