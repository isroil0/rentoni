/**
 * Chart parameters for the Rentoni design system.
 *
 * The two categorical slots were checked with the dataviz validator against the white
 * card surface and pass every gate — worst-pair CVD ΔE 28.7 (protan), normal-vision
 * ΔE 35.7, both ≥ 3:1 contrast on the surface. Slot 1 is the product's brand accent so
 * charts belong to the same system as the rest of the UI.
 */
export const CHART = {
  series1: '#4f56d4', // brand indigo — revenue / the primary measure
  series2: '#eb6834', // orange — cost, the comparison measure
  surface: '#ffffff',
  grid: '#eeeef0', // one step off surface, hairline, solid
  axisLine: '#e0e0e4',
  textSecondary: '#71717f',
  textPrimary: '#18181d',
  /** Mark specs: bars never fill their band, and data-ends are rounded. */
  maxBarSize: 24,
  barRadius: [4, 4, 0, 0] as [number, number, number, number],
  lineWidth: 2,
  dotRadius: 4,
} as const;

/** Compact axis labels — "$1.2K" rather than "$1,200.00" on a tick. */
export function compactMoney(value: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      notation: Math.abs(value) >= 1000 ? 'compact' : 'standard',
      maximumFractionDigits: Math.abs(value) >= 1000 ? 1 : 0,
    }).format(value);
  } catch {
    return String(value);
  }
}

/** "2026-09-17" -> "17 Sep" */
export function shortDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(date);
}
