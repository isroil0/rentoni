import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PosApi, type PosLine } from '@/api/pos.api';
import { qk } from '@/lib/queryClient';
import { useDebounce } from '@/hooks/useDebounce';
import { ApiError } from '@/lib/apiClient';
import { formatMoney } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  LoadingState,
  Select,
  StatusBadge,
  useErrorMessage,
  useToast,
} from '@/components/ui';
import { QuantitySelector } from '@/components/shop/QuantitySelector';
import { ReceiptDialog } from './pos/ReceiptDialog';
import type { AdminOrder, PaymentMethod, PosSearchResult } from '@/api/types';
import { useT } from '@/i18n';

interface TicketLine {
  variantId: number;
  sku: string;
  productName: string;
  color: string;
  size: string;
  unitPrice: number;
  available: number;
  quantity: number;
  discount: number;
}

/**
 * Point of sale.
 *
 * Optimised for one job: find a shirt, pick the variant, ring it up — without leaving
 * the screen. The ticket is priced by `POST /admin/pos/quote` on every change, so the
 * totals on screen are the backend's numbers, not a local calculation; completing the
 * sale re-prices and deducts stock inside a single backend transaction.
 */
export default function PosPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const [lines, setLines] = useState<TicketLine[]>([]);
  const [discountMode, setDiscountMode] = useState<'amount' | 'percent'>('amount');
  const [discountValue, setDiscountValue] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [customerName, setCustomerName] = useState('');
  const [completed, setCompleted] = useState<AdminOrder | null>(null);

  // Keyboard-first: "/" jumps to the search box from anywhere on the screen.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if (event.key === '/' && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const results = useQuery({
    queryKey: qk.admin.posSearch(debouncedSearch),
    queryFn: () => PosApi.search(debouncedSearch, 24),
    enabled: debouncedSearch.trim().length > 0,
  });

  const quoteLines = useMemo<PosLine[]>(
    () => lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity, discount: line.discount || undefined })),
    [lines],
  );

  const parsedDiscount = Number(discountValue) || 0;

  // Server-side pricing preview. Nothing here is computed locally.
  const quote = useQuery({
    queryKey: ['pos', 'quote', quoteLines, discountMode, parsedDiscount],
    queryFn: () =>
      PosApi.quote(
        quoteLines,
        discountMode === 'percent' ? { discountPercent: parsedDiscount } : { discount: parsedDiscount },
      ),
    enabled: quoteLines.length > 0,
    retry: false,
  });

  function addVariant(result: PosSearchResult) {
    setLines((current) => {
      const existing = current.find((line) => line.variantId === result.variantId);
      if (existing) {
        return current.map((line) =>
          line.variantId === result.variantId
            ? { ...line, quantity: Math.min(line.quantity + 1, Math.max(result.quantity, 1)) }
            : line,
        );
      }
      return [
        ...current,
        {
          variantId: result.variantId,
          sku: result.sku,
          productName: result.productName,
          color: result.color,
          size: result.size,
          unitPrice: result.price,
          available: result.quantity,
          quantity: 1,
          discount: 0,
        },
      ];
    });
    setSearch('');
    searchRef.current?.focus();
  }

  function updateLine(variantId: number, patch: Partial<TicketLine>) {
    setLines((current) => current.map((line) => (line.variantId === variantId ? { ...line, ...patch } : line)));
  }

  function removeLine(variantId: number) {
    setLines((current) => current.filter((line) => line.variantId !== variantId));
  }

  function resetTicket() {
    setLines([]);
    setDiscountValue('');
    setCustomerName('');
    setPaymentMethod('CASH');
    setSearch('');
    searchRef.current?.focus();
  }

  const completeSale = useMutation({
    mutationFn: () =>
      PosApi.createOrder({
        items: quoteLines,
        ...(discountMode === 'percent' ? { discountPercent: parsedDiscount } : { discount: parsedDiscount }),
        customerName: customerName.trim() || null,
        paymentMethod,
        // One backend transaction: order + items + stock deduction + inventory transactions.
        completeNow: true,
      }),
    onSuccess: async (order) => {
      setCompleted(order);
      resetTicket();
      toast.success(t('admin.pos.saleCompleted', { number: order.orderNumber, total: formatMoney(order.total) }));
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.isStockError) {
        toast.error(t('admin.pos.stockShortfall'));
      } else {
        toast.error(errorMessage(error));
      }
      await queryClient.invalidateQueries({ queryKey: ['pos', 'quote'] });
      void results.refetch();
    },
  });

  // The backend decides whether the sale can go through; the button mirrors that.
  const shortages = quote.data?.availability.filter((a) => !a.sufficient) ?? [];
  const canComplete = lines.length > 0 && quote.isSuccess && quote.data.canComplete && !completeSale.isPending;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
      {/* Search + results */}
      <div className="space-y-4">
        <Card>
          <CardBody>
            <Field
              label={t('admin.pos.findProduct')}
              hint={t('admin.pos.findHint')}
            >
              {(props) => (
                <Input
                  {...props}
                  ref={searchRef}
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('admin.pos.searchPlaceholder')}
                  autoComplete="off"
                  autoFocus
                />
              )}
            </Field>
          </CardBody>
        </Card>

        <Card>
          {!debouncedSearch.trim() && (
            <EmptyState
              title={t('admin.pos.startTitle')}
              description={t('admin.pos.startBody')}
            />
          )}

          {debouncedSearch.trim() && results.isLoading && <LoadingState label={t('admin.pos.searching')} />}

          {results.isError && <ErrorBanner error={results.error} className="m-5" />}

          {results.isSuccess && results.data.length === 0 && (
            <EmptyState title={t('admin.pos.noMatches')} description={t('admin.pos.noMatchesBody')} />
          )}

          {results.isSuccess && results.data.length > 0 && (
            <ul className="divide-y divide-ink-100">
              {results.data.map((result) => {
                const soldOut = result.quantity <= 0;
                return (
                  <li key={result.variantId}>
                    <button
                      type="button"
                      disabled={soldOut}
                      onClick={() => addVariant(result)}
                      className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink-900">{result.productName}</p>
                        <p className="mt-0.5 text-sm text-ink-500">
                          {result.color} · {result.size} ·{' '}
                          <span className="font-mono text-xs">{result.sku}</span>
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <StatusBadge status={result.stockStatus} />
                        <span className="text-sm tabular-nums text-ink-500">
                          {t('admin.pos.inStockCount', { count: result.quantity })}
                        </span>
                        <span className="w-20 text-right font-semibold text-ink-900">{formatMoney(result.price)}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Ticket */}
      <div className="xl:sticky xl:top-24 xl:self-start">
        <Card className="flex max-h-[calc(100vh-8rem)] flex-col">
          <div className="flex items-center justify-between border-b border-ink-200 px-5 py-4">
            <h2 className="text-base font-semibold text-ink-900">{t('admin.pos.currentSale')}</h2>
            {lines.length > 0 && (
              <Button variant="link" className="text-sm text-ink-500 hover:text-danger-600" onClick={resetTicket}>
                {t('admin.pos.clear')}
              </Button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {lines.length === 0 ? (
              <EmptyState title={t('admin.pos.noItems')} description={t('admin.pos.noItemsBody')} />
            ) : (
              <ul className="divide-y divide-ink-100">
                {lines.map((line) => {
                  const shortage = shortages.find((s) => s.variantId === line.variantId);
                  return (
                    <li key={line.variantId} className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink-900">{line.productName}</p>
                          <p className="text-xs text-ink-500">
                            {line.color} · {line.size} · {formatMoney(line.unitPrice)}
                          </p>
                        </div>
                        <Button
                          variant="link"
                          className="text-xs text-ink-400 hover:text-danger-600"
                          onClick={() => removeLine(line.variantId)}
                          aria-label={t('admin.pos.removeItem', {
                            name: line.productName,
                            colour: line.color,
                            size: line.size,
                          })}
                        >
                          {t('common.remove')}
                        </Button>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <QuantitySelector
                          size="sm"
                          value={line.quantity}
                          max={Math.max(line.available, 1)}
                          label={t('admin.pos.quantityFor', { sku: line.sku })}
                          onChange={(quantity) => updateLine(line.variantId, { quantity })}
                        />
                        <label className="flex items-center gap-1.5 text-xs text-ink-500">
                          <span>{t('admin.pos.discountShort')}</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.discount || ''}
                            onChange={(event) => updateLine(line.variantId, { discount: Number(event.target.value) || 0 })}
                            aria-label={t('admin.pos.lineDiscountFor', { sku: line.sku })}
                            className="h-8 w-16 rounded border border-ink-300 px-2 text-right text-sm tabular-nums focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
                          />
                        </label>
                      </div>

                      {shortage && (
                        <Badge tone="danger">{t('admin.pos.onlyLeft', { count: shortage.available })}</Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Totals + payment */}
          <div className="space-y-3 border-t border-ink-200 bg-ink-50/60 p-5">
            <div className="flex gap-2">
              <Select
                aria-label={t('admin.pos.discountType')}
                className="w-28"
                value={discountMode}
                onChange={(event) => setDiscountMode(event.target.value as 'amount' | 'percent')}
              >
                <option value="amount">{t('admin.pos.amount')}</option>
                <option value="percent">{t('admin.pos.percent')}</option>
              </Select>
              <Input
                type="number"
                min={0}
                step="0.01"
                aria-label={t('admin.pos.orderDiscount')}
                placeholder="0"
                value={discountValue}
                onChange={(event) => setDiscountValue(event.target.value)}
                className="text-right tabular-nums"
              />
            </div>

            <Input
              aria-label={t('admin.pos.customerNameOptional')}
              placeholder={t('admin.pos.customerNameOptional')}
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
            />

            <dl className="space-y-1.5 border-t border-ink-200 pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-600">{t('common.subtotal')}</dt>
                <dd className="tabular-nums text-ink-900">{formatMoney(quote.data?.subtotal ?? 0)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-600">{t('common.discount')}</dt>
                <dd className="tabular-nums text-ink-900">−{formatMoney(quote.data?.discount ?? 0)}</dd>
              </div>
              <div className="flex justify-between border-t border-ink-200 pt-1.5 text-base">
                <dt className="font-semibold text-ink-900">{t('common.total')}</dt>
                <dd className="font-semibold tabular-nums text-ink-900">{formatMoney(quote.data?.total ?? 0)}</dd>
              </div>
            </dl>

            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-ink-600">{t('checkout.paymentMethod')}</legend>
              <div className="grid grid-cols-3 gap-1.5">
                {(['CASH', 'CARD', 'OTHER'] as PaymentMethod[]).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    aria-pressed={paymentMethod === method}
                    className={`rounded-md border px-2 py-2 text-sm font-medium transition-colors ${
                      paymentMethod === method
                        ? 'border-brand-600 bg-brand-50 text-brand-700'
                        : 'border-ink-300 bg-white text-ink-700 hover:bg-ink-50'
                    }`}
                  >
                    {t(`payment.method${method.charAt(0)}${method.slice(1).toLowerCase()}`)}
                  </button>
                ))}
              </div>
            </fieldset>

            {quote.isError && <ErrorBanner error={quote.error} />}
            {completeSale.isError && <ErrorBanner error={completeSale.error} />}

            <Button
              size="lg"
              fullWidth
              disabled={!canComplete}
              loading={completeSale.isPending}
              onClick={() => completeSale.mutate()}
            >
              {t('admin.pos.completeSale')}
            </Button>

            <Button variant="secondary" fullWidth onClick={resetTicket} disabled={lines.length === 0}>
              {t('admin.pos.cancelSale')}
            </Button>
          </div>
        </Card>
      </div>

      <ReceiptDialog order={completed} onClose={() => setCompleted(null)} />
    </div>
  );
}
