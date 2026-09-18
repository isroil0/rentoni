import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART, compactMoney, shortDate } from './chartTokens';
import { ChartTooltip } from './ChartTooltip';
import { ChartTableView } from './ChartTableView';
import { EmptyState } from '@/components/ui';
import { formatMoney, formatNumber } from '@/lib/format';
import { useT } from '@/i18n';

export interface DayPoint {
  date: string;
  revenue: number;
  orders?: number;
  units?: number;
  cost?: number;
  profit?: number;
}

const axisTick = { fill: CHART.textSecondary, fontSize: 12 };

/**
 * Daily revenue.
 *
 * Revenue per day is a set of discrete buckets, so columns are the honest mark — a
 * line would imply values between days. One series, so no legend: the card title
 * already says what is plotted.
 */
export function RevenueBarChart({ data, height = 260 }: { data: DayPoint[]; height?: number }) {
  const t = useT();
  if (data.length === 0) {
    return <EmptyState title={t('admin.reports.noSalesPeriod')} description={t('admin.reports.widerRange')} />;
  }

  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART.grid} strokeWidth={1} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={axisTick}
              tickLine={false}
              axisLine={{ stroke: CHART.axisLine }}
              minTickGap={16}
            />
            <YAxis
              tickFormatter={(value: number) => compactMoney(value)}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={64}
            />
            <Tooltip
              cursor={{ fill: 'rgba(24, 24, 29, 0.04)' }}
              content={
                <ChartTooltip
                  labelFormatter={shortDate}
                  series={[{ key: 'revenue', label: t('admin.reports.chartRevenue'), color: CHART.series1 }]}
                />
              }
            />
            <Bar
              dataKey="revenue"
              name={t('admin.reports.chartRevenue')}
              fill={CHART.series1}
              radius={CHART.barRadius}
              maxBarSize={CHART.maxBarSize}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ChartTableView
        rows={data}
        columns={[
          { key: 'date', label: t('common.date'), format: (row) => shortDate(row.date) },
          { key: 'orders', label: t('common.orders'), align: 'right', format: (row) => formatNumber(row.orders ?? 0) },
          { key: 'units', label: t('common.units'), align: 'right', format: (row) => formatNumber(row.units ?? 0) },
          { key: 'revenue', label: t('common.revenue'), align: 'right', format: (row) => formatMoney(row.revenue) },
        ]}
      />
    </div>
  );
}

/**
 * Revenue against cost of goods over time.
 *
 * Both series are money, so they share one axis — never a second y-scale. Two series
 * means a legend is mandatory; identity is never left to colour alone.
 */
export function RevenueVsCostChart({ data, height = 280 }: { data: DayPoint[]; height?: number }) {
  const t = useT();
  if (data.length === 0) {
    return <EmptyState title={t('admin.reports.noSalesPeriod')} description={t('admin.reports.widerRange')} />;
  }

  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART.grid} strokeWidth={1} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={axisTick}
              tickLine={false}
              axisLine={{ stroke: CHART.axisLine }}
              minTickGap={16}
            />
            <YAxis
              tickFormatter={(value: number) => compactMoney(value)}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={64}
            />
            <Tooltip
              cursor={{ stroke: CHART.axisLine, strokeWidth: 1 }}
              content={
                <ChartTooltip
                  labelFormatter={shortDate}
                  series={[
                    { key: 'revenue', label: t('admin.reports.chartRevenue'), color: CHART.series1 },
                    { key: 'cost', label: t('admin.reports.chartCost'), color: CHART.series2 },
                  ]}
                />
              }
            />
            <Legend
              verticalAlign="top"
              align="left"
              height={28}
              iconType="plainline"
              formatter={(value) => <span className="text-xs text-ink-600">{value}</span>}
            />
            <Line
              type="monotone"
              dataKey="revenue"
              name={t('admin.reports.chartRevenue')}
              stroke={CHART.series1}
              strokeWidth={CHART.lineWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              // A 2px surface ring keeps markers legible where the lines cross.
              dot={{ r: CHART.dotRadius, fill: CHART.series1, stroke: CHART.surface, strokeWidth: 2 }}
              activeDot={{ r: 5, fill: CHART.series1, stroke: CHART.surface, strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="cost"
              name={t('admin.reports.chartCost')}
              stroke={CHART.series2}
              strokeWidth={CHART.lineWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={{ r: CHART.dotRadius, fill: CHART.series2, stroke: CHART.surface, strokeWidth: 2 }}
              activeDot={{ r: 5, fill: CHART.series2, stroke: CHART.surface, strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <ChartTableView
        rows={data}
        columns={[
          { key: 'date', label: t('common.date'), format: (row) => shortDate(row.date) },
          { key: 'revenue', label: t('common.revenue'), align: 'right', format: (row) => formatMoney(row.revenue) },
          { key: 'cost', label: t('common.cost'), align: 'right', format: (row) => formatMoney(row.cost ?? 0) },
          { key: 'profit', label: t('common.profit'), align: 'right', format: (row) => formatMoney(row.profit ?? 0) },
        ]}
      />
    </div>
  );
}
