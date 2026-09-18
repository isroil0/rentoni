import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '@/hooks/useCart';
import { formatMoney } from '@/lib/format';
import { Badge, Button, useErrorMessage, useToast } from '@/components/ui';
import { QuantitySelector } from './QuantitySelector';
import { ProductImage } from './ProductImage';
import type { CartItem } from '@/api/types';
import { useT } from '@/i18n';

/** One cart row — used in both the drawer and the full cart page. */
export function CartLine({ item, compact = false }: { item: CartItem; compact?: boolean }) {
  const { setQuantity, removeItem } = useCart();
  const t = useT();
  const errorMessage = useErrorMessage();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-3">
      <Link to={`/products/${item.productId}`} className="shrink-0">
        <ProductImage
          image={null}
          alt={item.productName}
          className={compact ? 'h-20 w-16 rounded-md' : 'h-28 w-24 rounded-md border border-ink-200'}
        />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              to={`/products/${item.productId}`}
              className="block truncate text-sm font-medium text-ink-900 hover:text-brand-600"
            >
              {item.productName}
            </Link>
            <p className="text-xs text-ink-500">
              {item.color} · {item.size}
              <span className="sr-only"> (SKU {item.sku})</span>
            </p>
          </div>
          <span className="whitespace-nowrap text-sm font-semibold text-ink-900">{formatMoney(item.lineTotal)}</span>
        </div>

        {!item.purchasable && (
          <Badge tone="danger">
            {item.available ? t('cart.unavailable') : t('cart.notEnoughStock')}
          </Badge>
        )}

        <p className="text-xs text-ink-500">{t('cart.each', { price: formatMoney(item.unitPrice) })}</p>

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <QuantitySelector
            size="sm"
            value={item.quantity}
            disabled={busy}
            label={t('cart.quantityFor', { name: item.productName, colour: item.color, size: item.size })}
            onChange={(quantity) => void run(() => setQuantity(item.variantId, quantity))}
          />
          <Button
            variant="link"
            className="text-xs text-ink-500 hover:text-danger-600"
            disabled={busy}
            onClick={() => void run(() => removeItem(item.variantId))}
          >
            {t('common.remove')}
            <span className="sr-only"> {item.productName}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
