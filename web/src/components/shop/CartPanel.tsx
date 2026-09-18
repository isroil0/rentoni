import { Link } from 'react-router-dom';
import { useCart } from '@/hooks/useCart';
import { formatMoney } from '@/lib/format';
import { Button, EmptyState, LinkButton, LoadingState } from '@/components/ui';
import { CartLine } from './CartLine';
import { useT } from '@/i18n';

/** Compact cart used inside the header drawer. */
export function CartPanel({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT();
  const { items, subtotal, isLoading, itemCount, readyForCheckout } = useCart();

  if (isLoading) return <LoadingState label={t('cart.loading')} />;

  if (items.length === 0) {
    return (
      <EmptyState
        title={t('cart.empty')}
        description={t('cart.emptyDrawerBody')}
        action={
          <Button onClick={onNavigate} variant="secondary" className="px-0">
            <Link to="/shop" className="px-4 py-2">
              {t('home.shopShirts')}
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ul className="flex-1 divide-y divide-ink-100">
        {items.map((item) => (
          <li key={item.variantId} className="p-4">
            <CartLine item={item} compact />
          </li>
        ))}
      </ul>

      <div className="space-y-3 border-t border-ink-200 bg-ink-50/60 p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-600">
            {t('cart.subtotalWithCount', { count: t('common.itemCount', { count: itemCount }) })}
          </span>
          <span className="font-semibold text-ink-900">{formatMoney(subtotal)}</span>
        </div>
        <p className="text-xs text-ink-500">{t('cart.totalsConfirmed')}</p>
        <div className="grid gap-2">
          <LinkButton to="/checkout" fullWidth className={readyForCheckout ? '' : 'pointer-events-none opacity-50'}>
            {t('cart.checkout')}
          </LinkButton>
          <LinkButton to="/cart" variant="secondary" fullWidth>
            {t('cart.viewCart')}
          </LinkButton>
        </div>
      </div>
    </div>
  );
}
