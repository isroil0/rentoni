import { Badge } from '@/components/ui';
import type { StockStatus } from '@/api/types';
import { useT } from '@/i18n';

/**
 * Customer-facing stock signal.
 *
 * Deliberately vague by default: LOW_STOCK reads as "Only a few left" rather than a
 * number. An exact count is only ever shown when the backend chose to include one
 * (the `customer.expose_exact_stock` setting), never inferred by the frontend.
 */
export function AvailabilityBadge({
  status,
  quantity,
  className,
}: {
  status: StockStatus;
  quantity?: number;
  className?: string;
}) {
  const t = useT();

  if (status === 'OUT_OF_STOCK') {
    return (
      <Badge tone="danger" className={className}>
        {t('stock.outOfStock')}
      </Badge>
    );
  }

  if (status === 'LOW_STOCK') {
    return (
      <Badge tone="warn" className={className}>
        {typeof quantity === 'number' ? t('stock.lowStockCount', { count: quantity }) : t('stock.lowStock')}
      </Badge>
    );
  }

  return (
    <Badge tone="success" className={className}>
      {typeof quantity === 'number' ? t('stock.inStockCount', { count: quantity }) : t('stock.inStock')}
    </Badge>
  );
}
