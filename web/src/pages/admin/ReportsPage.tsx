import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ReportsApi, type RangePreset, type RangeQuery } from '@/api/reports.api';
import { qk } from '@/lib/queryClient';
import { formatMoney, formatNumber, todayISO } from '@/lib/format';
import { cn } from '@/lib/cn';
import { RevenueBarChart, RevenueVsCostChart } from '@/components/charts/SalesChart';
import { StatTile } from '@/components/admin/StatTile';
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
  StatusBadge,
  TableWrap,
  THead,
  TH,
  TBody,
  TR,
  TD,
} from '@/components/ui';
import { useT } from '@/i18n';

type Tab = 'sales' | 'products' | 'inventory' | 'purchases' | 'returns' | 'profit';

/**
 * Every figure on this page — including profit and margin — is computed by the backend.
 * The frontend renders the numbers it is given and never recalculates them.
 */
export default function ReportsPage() {
  const t = useT();
  const PRESETS: { value: RangePreset; label: string }[] = [
    { value: 'today', label: t('admin.reports.today') },
    { value: 'week', label: t('admin.reports.thisWeek') },
    { value: 'month', label: t('admin.reports.thisMonth') },
    { value: 'year', label: t('admin.reports.thisYear') },
  ];
  const TABS: { value: Tab; label: string }[] = [
    { value: 'sales', label: t('admin.reports.tabs.sales') },
    { value: 'products', label: t('admin.reports.tabs.products') },
    { value: 'inventory', label: t('admin.reports.tabs.inventory') },
    { value: 'purchases', label: t('admin.reports.tabs.purchases') },
    { value: 'returns', label: t('admin.reports.tabs.returns') },
    { value: 'profit', label: t('admin.reports.tabs.profit') },
  ];
  const [tab, setTab] = useState<Tab>('sales');
  const [preset, setPreset] = useState<RangePreset | 'custom'>('month');
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());

  const range: RangeQuery = preset === 'custom' ? { from, to } : { preset };

  const sales = useQuery({
    queryKey: qk.admin.reports('sales', range),
    queryFn: () => ReportsApi.sales(range),
    enabled: tab === 'sales',
  });
  const products = useQuery({
    queryKey: qk.admin.reports('products', range),
    queryFn: () => ReportsApi.products(range, 10),
    enabled: tab === 'products',
  });
  const inventory = useQuery({
    queryKey: qk.admin.reports('inventory', 'current'),
    queryFn: () => ReportsApi.inventory(),
    enabled: tab === 'inventory',
  });
  const purchases = useQuery({
    queryKey: qk.admin.reports('purchases', range),
    queryFn: () => ReportsApi.purchases(range),
    enabled: tab === 'purchases',
  });
  const returns = useQuery({
    queryKey: qk.admin.reports('returns', range),
    queryFn: () => ReportsApi.returns(range),
    enabled: tab === 'returns',
  });
  const profit = useQuery({
    queryKey: qk.admin.reports('profit', range),
    queryFn: () => ReportsApi.profit(range),
    enabled: tab === 'profit',
  });

  return (
    <div className="space-y-6">
      {/* Date filters sit in one row above the reports. */}
      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="flex rounded-md border border-ink-300 p-0.5" role="group" aria-label={t('admin.reports.period')}>
            {PRESETS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPreset(option.value)}
                aria-pressed={preset === option.value}
                className={cn(
                  'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                  preset === option.value ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100',
                )}
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPreset('custom')}
              aria-pressed={preset === 'custom'}
              className={cn(
                'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                preset === 'custom' ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100',
              )}
            >
              {t('admin.reports.custom')}
            </button>
          </div>

          {preset === 'custom' && (
            <div className="flex items-end gap-2">
              <div>
                <label htmlFor="report-from" className="mb-1 block text-xs text-ink-500">
                  {t('admin.reports.from')}
                </label>
                <Input id="report-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <label htmlFor="report-to" className="mb-1 block text-xs text-ink-500">
                  {t('admin.reports.to')}
                </label>
                <Input id="report-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Report tabs */}
      <div
        className="flex gap-1 overflow-x-auto border-b border-ink-200"
        role="tablist"
        aria-label={t('admin.reports.sections')}
      >
        {TABS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={tab === option.value}
            onClick={() => setTab(option.value)}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              tab === option.value
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-ink-600 hover:text-ink-900',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Sales */}
      {tab === 'sales' && (
        <div className="space-y-6">
          {sales.isLoading && <Skeleton className="h-72 w-full" />}
          {sales.isError && <ErrorState error={sales.error} onRetry={() => void sales.refetch()} />}
          {sales.isSuccess && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatTile label={t('common.revenue')} value={formatMoney(sales.data.totals.revenue)} />
                <StatTile label={t('common.orders')} value={formatNumber(sales.data.totals.orders)} />
                <StatTile label={t('admin.reports.itemsSold')} value={formatNumber(sales.data.totals.unitsSold)} />
                <StatTile label={t('admin.reports.discounts')} value={formatMoney(sales.data.totals.discounts)} />
              </div>

              <Card>
                <CardHeader title={t('admin.reports.revenueByDay')} />
                <CardBody>
                  <RevenueBarChart data={sales.data.byDay} />
                </CardBody>
              </Card>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader title={t('admin.reports.bySource')} />
                  <TableWrap>
                    <THead>
                      <TR>
                        <TH>{t('common.source')}</TH>
                        <TH align="right">{t('common.orders')}</TH>
                        <TH align="right">{t('common.units')}</TH>
                        <TH align="right">{t('common.revenue')}</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {sales.data.bySource.map((row) => (
                        <TR key={row.source}>
                          <TD>
                            <StatusBadge status={row.source} />
                          </TD>
                          <TD align="right" className="tabular-nums">
                            {formatNumber(row.orders)}
                          </TD>
                          <TD align="right" className="tabular-nums">
                            {formatNumber(row.units)}
                          </TD>
                          <TD align="right" className="tabular-nums font-medium text-ink-900">
                            {formatMoney(row.revenue)}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </TableWrap>
                </Card>

                <Card>
                  <CardHeader title={t('admin.reports.byPaymentMethod')} />
                  <TableWrap>
                    <THead>
                      <TR>
                        <TH>{t('admin.reports.method')}</TH>
                        <TH align="right">{t('common.orders')}</TH>
                        <TH align="right">{t('common.revenue')}</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {sales.data.byPaymentMethod.map((row) => (
                        <TR key={row.method}>
                          <TD>{row.method}</TD>
                          <TD align="right" className="tabular-nums">
                            {formatNumber(row.orders)}
                          </TD>
                          <TD align="right" className="tabular-nums font-medium text-ink-900">
                            {formatMoney(row.revenue)}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </TableWrap>
                </Card>
              </div>
            </>
          )}
        </div>
      )}

      {/* Products */}
      {tab === 'products' && (
        <div className="space-y-6">
          {products.isLoading && <Skeleton className="h-72 w-full" />}
          {products.isError && <ErrorState error={products.error} onRetry={() => void products.refetch()} />}
          {products.isSuccess && products.data.topSellers.length === 0 && (
            <EmptyState title={t('admin.reports.noProductSales')} description={t('admin.reports.widerRange')} />
          )}
          {products.isSuccess && products.data.topSellers.length > 0 && (
            <>
              <Card>
                <CardHeader
                  title={t('admin.reports.bestSellers')}
                  description={t('admin.reports.variantsSold', { count: products.data.distinctVariantsSold })}
                />
                <TableWrap>
                  <THead>
                    <TR>
                      <TH>{t('common.product')}</TH>
                      <TH>{t('common.variant')}</TH>
                      <TH>{t('common.sku')}</TH>
                      <TH align="right">{t('common.units')}</TH>
                      <TH align="right">{t('common.revenue')}</TH>
                      <TH align="right">{t('common.profit')}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {products.data.topSellers.map((row) => (
                      <TR key={row.variantId}>
                        <TD className="font-medium text-ink-900">{row.productName}</TD>
                        <TD className="whitespace-nowrap text-xs">
                          {row.color} · {row.size}
                        </TD>
                        <TD className="font-mono text-xs">{row.sku}</TD>
                        <TD align="right" className="tabular-nums">
                          {formatNumber(row.unitsSold)}
                        </TD>
                        <TD align="right" className="tabular-nums">
                          {formatMoney(row.revenue)}
                        </TD>
                        <TD align="right" className="tabular-nums font-medium text-success-700">
                          {formatMoney(row.profit)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </TableWrap>
              </Card>

              <Card>
                <CardHeader title={t('admin.reports.slowestMovers')} />
                <TableWrap>
                  <THead>
                    <TR>
                      <TH>{t('common.product')}</TH>
                      <TH>{t('common.variant')}</TH>
                      <TH align="right">{t('common.units')}</TH>
                      <TH align="right">{t('common.revenue')}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {products.data.slowMovers.map((row) => (
                      <TR key={row.variantId}>
                        <TD className="font-medium text-ink-900">{row.productName}</TD>
                        <TD className="whitespace-nowrap text-xs">
                          {row.color} · {row.size}
                        </TD>
                        <TD align="right" className="tabular-nums">
                          {formatNumber(row.unitsSold)}
                        </TD>
                        <TD align="right" className="tabular-nums">
                          {formatMoney(row.revenue)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </TableWrap>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Inventory */}
      {tab === 'inventory' && (
        <div className="space-y-6">
          {inventory.isLoading && <Skeleton className="h-72 w-full" />}
          {inventory.isError && <ErrorState error={inventory.error} onRetry={() => void inventory.refetch()} />}
          {inventory.isSuccess && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatTile label={t('admin.reports.totalUnits')} value={formatNumber(inventory.data.totals.totalUnits)} />
                <StatTile label={t('admin.reports.stockAtCost')} value={formatMoney(inventory.data.totals.stockValueAtCost)} />
                <StatTile label={t('admin.reports.stockAtRetail')} value={formatMoney(inventory.data.totals.stockValueAtRetail)} />
                <StatTile
                  label={t('admin.reports.potentialProfit')}
                  value={formatMoney(inventory.data.totals.potentialProfit)}
                  tone="success"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <StatTile label={t('admin.reports.inStock')} value={formatNumber(inventory.data.byStatus.IN_STOCK)} tone="success" />
                <StatTile label={t('admin.reports.lowStock')} value={formatNumber(inventory.data.byStatus.LOW_STOCK)} tone="warn" />
                <StatTile
                  label={t('admin.reports.outOfStock')}
                  value={formatNumber(inventory.data.byStatus.OUT_OF_STOCK)}
                  tone="danger"
                />
              </div>

              <Card>
                <CardHeader title={t('admin.reports.byCategory')} />
                <TableWrap>
                  <THead>
                    <TR>
                      <TH>{t('common.category')}</TH>
                      <TH align="right">{t('common.units')}</TH>
                      <TH align="right">{t('admin.reports.stockValue')}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {inventory.data.byCategory.map((row) => (
                      <TR key={row.category}>
                        <TD className="font-medium text-ink-900">{row.category}</TD>
                        <TD align="right" className="tabular-nums">
                          {formatNumber(row.units)}
                        </TD>
                        <TD align="right" className="tabular-nums font-medium text-ink-900">
                          {formatMoney(row.stockValue)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </TableWrap>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Purchases */}
      {tab === 'purchases' && (
        <div className="space-y-6">
          {purchases.isLoading && <Skeleton className="h-72 w-full" />}
          {purchases.isError && <ErrorState error={purchases.error} onRetry={() => void purchases.refetch()} />}
          {purchases.isSuccess && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatTile label={t('admin.suppliers.purchases')} value={formatNumber(purchases.data.totals.purchases)} />
                <StatTile label={t('admin.reports.received')} value={formatNumber(purchases.data.totals.received)} tone="success" />
                <StatTile label={t('admin.reports.unitsReceived')} value={formatNumber(purchases.data.totals.unitsReceived)} />
                <StatTile label={t('admin.reports.costReceived')} value={formatMoney(purchases.data.totals.costReceived)} />
              </div>

              <Card>
                <CardHeader title={t('admin.reports.bySupplier')} />
                {purchases.data.bySupplier.length === 0 ? (
                  <EmptyState title={t('admin.reports.noPurchases')} />
                ) : (
                  <TableWrap>
                    <THead>
                      <TR>
                        <TH>{t('common.supplier')}</TH>
                        <TH align="right">{t('admin.suppliers.purchases')}</TH>
                        <TH align="right">{t('common.units')}</TH>
                        <TH align="right">{t('common.cost')}</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {purchases.data.bySupplier.map((row) => (
                        <TR key={row.supplier}>
                          <TD className="font-medium text-ink-900">{row.supplier}</TD>
                          <TD align="right" className="tabular-nums">
                            {formatNumber(row.purchases)}
                          </TD>
                          <TD align="right" className="tabular-nums">
                            {formatNumber(row.units)}
                          </TD>
                          <TD align="right" className="tabular-nums font-medium text-ink-900">
                            {formatMoney(row.cost)}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </TableWrap>
                )}
              </Card>
            </>
          )}
        </div>
      )}

      {/* Returns */}
      {tab === 'returns' && (
        <div className="space-y-6">
          {returns.isLoading && <Skeleton className="h-72 w-full" />}
          {returns.isError && <ErrorState error={returns.error} onRetry={() => void returns.refetch()} />}
          {returns.isSuccess && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatTile label={t('admin.reports.returnsCount')} value={formatNumber(returns.data.totals.returns)} />
                <StatTile label={t('admin.reports.accepted')} value={formatNumber(returns.data.totals.accepted)} tone="success" />
                <StatTile label={t('admin.reports.unitsReturned')} value={formatNumber(returns.data.totals.unitsReturned)} />
                <StatTile
                  label={t('admin.reports.refundValue')}
                  value={formatMoney(returns.data.totals.refundValue)}
                  tone="danger"
                />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader title={t('admin.reports.byReason')} />
                  {returns.data.byReason.length === 0 ? (
                    <EmptyState title={t('admin.reports.noReturns')} />
                  ) : (
                    <TableWrap>
                      <THead>
                        <TR>
                          <TH>{t('common.reason')}</TH>
                          <TH align="right">{t('common.units')}</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {returns.data.byReason.map((row) => (
                          <TR key={row.reason}>
                            <TD>{row.reason}</TD>
                            <TD align="right" className="tabular-nums">
                              {formatNumber(row.units)}
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </TableWrap>
                  )}
                </Card>

                <Card>
                  <CardHeader title={t('admin.reports.mostReturned')} />
                  {returns.data.topReturnedVariants.length === 0 ? (
                    <EmptyState title={t('admin.reports.nothingReturned')} />
                  ) : (
                    <TableWrap>
                      <THead>
                        <TR>
                          <TH>{t('common.product')}</TH>
                          <TH>{t('common.sku')}</TH>
                          <TH align="right">{t('common.units')}</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {returns.data.topReturnedVariants.map((row) => (
                          <TR key={row.sku}>
                            <TD className="font-medium text-ink-900">{row.productName}</TD>
                            <TD className="font-mono text-xs">{row.sku}</TD>
                            <TD align="right" className="tabular-nums">
                              {formatNumber(row.units)}
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </TableWrap>
                  )}
                </Card>
              </div>
            </>
          )}
        </div>
      )}

      {/* Profit */}
      {tab === 'profit' && (
        <div className="space-y-6">
          {profit.isLoading && <Skeleton className="h-72 w-full" />}
          {profit.isError && <ErrorState error={profit.error} onRetry={() => void profit.refetch()} />}
          {profit.isSuccess && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatTile label={t('common.revenue')} value={formatMoney(profit.data.totals.revenue)} />
                <StatTile label={t('admin.reports.costOfGoods')} value={formatMoney(profit.data.totals.costOfGoods)} />
                <StatTile label={t('common.profit')} value={formatMoney(profit.data.totals.profit)} tone="success" />
                <StatTile label={t('admin.reports.margin')} value={`${profit.data.totals.marginPercent}%`} />
              </div>

              <Card>
                <CardHeader title={t('admin.reports.revenueAndCost')} description={t('admin.reports.oneAxis')} />
                <CardBody>
                  <RevenueVsCostChart data={profit.data.byDay} />
                </CardBody>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}
