import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ReportsApi, type RangePreset } from '@/api/reports.api';
import { InventoryApi } from '@/api/inventory.api';
import { qk } from '@/lib/queryClient';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { StatTile, StatTileSkeleton } from '@/components/admin/StatTile';
import { RevenueBarChart } from '@/components/charts/SalesChart';
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  LinkButton,
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

export default function DashboardPage() {
  const t = useT();
  const RANGES: { value: RangePreset; label: string; chartLabel: string }[] = [
    { value: 'today', label: t('admin.dashboard.rangeToday'), chartLabel: t('admin.dashboard.periodToday') },
    { value: 'week', label: t('admin.dashboard.range7'), chartLabel: t('admin.dashboard.periodWeek') },
    { value: 'month', label: t('admin.dashboard.range30'), chartLabel: t('admin.dashboard.periodMonth') },
  ];
  const [range, setRange] = useState<RangePreset>('today');

  const summary = useQuery({
    queryKey: qk.admin.dashboard('today'),
    queryFn: () => ReportsApi.dashboard({ preset: 'today' }),
  });

  const salesSeries = useQuery({
    queryKey: qk.admin.reports('sales', range),
    queryFn: () => ReportsApi.sales({ preset: range }),
  });

  const lowStock = useQuery({
    queryKey: qk.admin.lowStock({ limit: 8 }),
    queryFn: () => InventoryApi.lowStock({ page: 1, limit: 8 }),
  });

  if (summary.isError) {
    return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />;
  }

  const data = summary.data;

  return (
    <div className="space-y-6">
      {/* Today's headline numbers */}
      <section aria-labelledby="today-heading">
        <h2 id="today-heading" className="sr-only">
          {t('admin.dashboard.summaryHeading')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summary.isLoading || !data
            ? Array.from({ length: 8 }, (_, i) => <StatTileSkeleton key={i} />)
            : [
                <StatTile
                  key="sales"
                  label={t('admin.dashboard.todaysSales')}
                  value={formatNumber(data.sales.orders)}
                  hint={t('admin.dashboard.ordersPlaced')}
                />,
                <StatTile
                  key="revenue"
                  label={t('admin.dashboard.todaysRevenue')}
                  value={formatMoney(data.sales.revenue)}
                  hint={t('admin.dashboard.profitHint', { amount: formatMoney(data.sales.profit) })}
                />,
                <StatTile
                  key="items"
                  label={t('admin.dashboard.itemsSoldToday')}
                  value={formatNumber(data.sales.itemsSold)}
                  hint={t('admin.dashboard.averageOrder', { amount: formatMoney(data.sales.averageOrderValue) })}
                />,
                <StatTile
                  key="units"
                  label={t('admin.dashboard.inventoryUnits')}
                  value={formatNumber(data.inventory.totalUnits)}
                  hint={t('admin.dashboard.atCost', { amount: formatMoney(data.inventory.stockValue) })}
                />,
                <StatTile
                  key="low"
                  label={t('admin.dashboard.lowStockVariants')}
                  value={formatNumber(data.inventory.lowStockVariants)}
                  tone={data.inventory.lowStockVariants > 0 ? 'warn' : 'neutral'}
                  action={
                    <Link to="/admin/inventory?status=LOW_STOCK" className="text-xs font-medium text-brand-600 hover:underline">
                      {t('admin.dashboard.reviewLowStock')}
                    </Link>
                  }
                />,
                <StatTile
                  key="out"
                  label={t('admin.dashboard.outOfStockVariants')}
                  value={formatNumber(data.inventory.outOfStockVariants)}
                  tone={data.inventory.outOfStockVariants > 0 ? 'danger' : 'neutral'}
                  action={
                    <Link to="/admin/inventory?status=OUT_OF_STOCK" className="text-xs font-medium text-brand-600 hover:underline">
                      {t('admin.dashboard.restockNow')}
                    </Link>
                  }
                />,
                <StatTile
                  key="customers"
                  label={t('admin.dashboard.totalCustomers')}
                  value={formatNumber(data.customers.total)}
                  hint={t('admin.dashboard.activeCount', { count: formatNumber(data.customers.active) })}
                />,
                <StatTile
                  key="pending"
                  label={t('admin.dashboard.pendingOrders')}
                  value={formatNumber(data.operations.pendingOrders)}
                  tone={data.operations.pendingOrders > 0 ? 'warn' : 'neutral'}
                  action={
                    <Link to="/admin/sales?status=PENDING" className="text-xs font-medium text-brand-600 hover:underline">
                      {t('admin.dashboard.viewOrders')}
                    </Link>
                  }
                />,
              ]}
        </div>
      </section>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <LinkButton to="/admin/pos">{t('admin.dashboard.openPos')}</LinkButton>
        <LinkButton to="/admin/purchases/new" variant="secondary">
          {t('admin.dashboard.newPurchase')}
        </LinkButton>
        <LinkButton to="/admin/products/new" variant="secondary">
          {t('admin.dashboard.addProduct')}
        </LinkButton>
      </div>

      {/* Sales overview */}
      <Card>
        <CardHeader
          title={t('admin.dashboard.salesOverview')}
          description={t('admin.dashboard.revenueFor', {
            period: RANGES.find((r) => r.value === range)?.chartLabel ?? '',
          })}
          action={
            <div className="flex rounded-md border border-ink-300 p-0.5" role="group" aria-label={t('admin.dashboard.chartPeriod')}>
              {RANGES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRange(option.value)}
                  aria-pressed={range === option.value}
                  className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                    range === option.value ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          }
        />
        <CardBody>
          {salesSeries.isLoading && <Skeleton className="h-64 w-full" />}
          {salesSeries.isError && <ErrorState error={salesSeries.error} onRetry={() => void salesSeries.refetch()} />}
          {salesSeries.isSuccess && (
            <>
              <dl className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <dt className="text-sm text-ink-500">{t('common.revenue')}</dt>
                  <dd className="text-lg font-semibold text-ink-900">{formatMoney(salesSeries.data.totals.revenue)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-ink-500">{t('common.orders')}</dt>
                  <dd className="text-lg font-semibold text-ink-900">{formatNumber(salesSeries.data.totals.orders)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-ink-500">{t('admin.dashboard.unitsSold')}</dt>
                  <dd className="text-lg font-semibold text-ink-900">{formatNumber(salesSeries.data.totals.unitsSold)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-ink-500">{t('common.profit')}</dt>
                  <dd className="text-lg font-semibold text-ink-900">{formatMoney(salesSeries.data.totals.profit)}</dd>
                </div>
              </dl>
              <RevenueBarChart data={salesSeries.data.byDay} />
            </>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Low stock */}
        <Card>
          <CardHeader
            title={t('admin.dashboard.lowStock')}
            description={t('admin.dashboard.lowStockBody')}
            action={
              <Link to="/admin/inventory?status=LOW_STOCK" className="text-sm font-medium text-brand-600 hover:underline">
                {t('common.viewAll')}
              </Link>
            }
          />
          {lowStock.isLoading && (
            <CardBody>
              <Skeleton className="h-40 w-full" />
            </CardBody>
          )}
          {lowStock.isError && <ErrorState error={lowStock.error} />}
          {lowStock.isSuccess && lowStock.data.items.length === 0 && (
            <EmptyState title={t('admin.dashboard.wellStocked')} description={t('admin.dashboard.wellStockedBody')} />
          )}
          {lowStock.isSuccess && lowStock.data.items.length > 0 && (
            <TableWrap>
              <THead>
                <TR>
                  <TH>{t('common.product')}</TH>
                  <TH>{t('common.colour')}</TH>
                  <TH>{t('common.size')}</TH>
                  <TH>{t('common.sku')}</TH>
                  <TH align="right">{t('admin.products.stock')}</TH>
                  <TH align="right">{t('admin.dashboard.minimum')}</TH>
                </TR>
              </THead>
              <TBody>
                {lowStock.data.items.map((row) => (
                  <TR key={row.variantId}>
                    <TD className="font-medium text-ink-900">
                      <Link to={`/admin/inventory/${row.variantId}`} className="hover:text-brand-600">
                        {row.product.name}
                      </Link>
                    </TD>
                    <TD>{row.color}</TD>
                    <TD>{row.size}</TD>
                    <TD className="font-mono text-xs">{row.sku}</TD>
                    <TD align="right" className="tabular-nums">
                      <span className={row.quantity === 0 ? 'font-semibold text-danger-600' : 'font-semibold text-warn-700'}>
                        {row.quantity}
                      </span>
                    </TD>
                    <TD align="right" className="tabular-nums">
                      {row.minimumStock}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}
        </Card>

        {/* Recent sales */}
        <Card>
          <CardHeader
            title={t('admin.dashboard.recentSales')}
            description={t('admin.dashboard.recentSalesBody')}
            action={
              <Link to="/admin/sales" className="text-sm font-medium text-brand-600 hover:underline">
                {t('common.viewAll')}
              </Link>
            }
          />
          {summary.isLoading && (
            <CardBody>
              <Skeleton className="h-40 w-full" />
            </CardBody>
          )}
          {data && data.recentOrders.length === 0 && (
            <EmptyState title={t('admin.dashboard.noSales')} description={t('admin.dashboard.noSalesBody')} />
          )}
          {data && data.recentOrders.length > 0 && (
            <TableWrap>
              <THead>
                <TR>
                  <TH>{t('admin.dashboard.order')}</TH>
                  <TH>{t('common.source')}</TH>
                  <TH align="right">{t('common.total')}</TH>
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
                    <TD>
                      <StatusBadge status={order.source} />
                    </TD>
                    <TD align="right" className="tabular-nums font-medium text-ink-900">
                      {formatMoney(order.total)}
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
      </div>
    </div>
  );
}
