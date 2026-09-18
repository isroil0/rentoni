import type { TooltipProps } from 'recharts';
import { formatMoney, formatNumber } from '@/lib/format';

export interface TooltipSeries {
  key: string;
  label: string;
  color: string;
  format?: 'money' | 'number';
}

/**
 * One tooltip listing every series at the hovered X.
 *
 * The value leads and the series name follows — the reader already knows which series
 * they are looking at and wants the number. Series identity is a short stroke of the
 * series colour beside the name; the text itself always wears a text token.
 * Labels are rendered as React text nodes, so API-supplied strings can never inject markup.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  series,
  labelFormatter,
}: TooltipProps<number, string> & {
  series: TooltipSeries[];
  labelFormatter?: (label: string) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border border-ink-200 bg-white px-3 py-2 shadow-sm">
      <p className="mb-1.5 text-xs text-ink-500">
        {labelFormatter ? labelFormatter(String(label)) : String(label)}
      </p>
      <ul className="space-y-1">
        {series.map((item) => {
          const entry = payload.find((p) => p.dataKey === item.key);
          if (!entry) return null;
          const value = Number(entry.value ?? 0);
          return (
            <li key={item.key} className="flex items-baseline gap-2 whitespace-nowrap">
              <span
                aria-hidden="true"
                className="inline-block h-0.5 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-sm font-semibold tabular-nums text-ink-900">
                {item.format === 'number' ? formatNumber(value) : formatMoney(value)}
              </span>
              <span className="text-xs text-ink-500">{item.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
