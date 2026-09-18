import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/cn';

/**
 * Renders a price or a price range. All values come from the backend — the frontend
 * never computes a price, discount or total.
 */
export function PriceDisplay({
  price,
  priceFrom,
  priceTo,
  className,
}: {
  price?: number | null;
  priceFrom?: number | null;
  priceTo?: number | null;
  className?: string;
}) {
  if (typeof price === 'number') {
    return <span className={cn('font-semibold text-ink-900', className)}>{formatMoney(price)}</span>;
  }

  if (typeof priceFrom !== 'number') {
    return <span className={cn('text-ink-500', className)}>—</span>;
  }

  const isRange = typeof priceTo === 'number' && priceTo !== priceFrom;

  return (
    <span className={cn('font-semibold text-ink-900', className)}>
      {isRange ? `${formatMoney(priceFrom)} – ${formatMoney(priceTo)}` : formatMoney(priceFrom)}
    </span>
  );
}
