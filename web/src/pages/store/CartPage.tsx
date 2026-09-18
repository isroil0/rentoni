import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '@/hooks/useCart';
import { formatMoney } from '@/lib/format';
import { CartLine } from '@/components/shop/CartLine';
import { Card, CardBody, EmptyState, LinkButton, LoadingState } from '@/components/ui';
import { useT } from '@/i18n';

export default function CartPage() {
  const t = useT();
  const { items, subtotal, itemCount, isLoading, readyForCheckout, refresh } = useCart();

  // Re-validate against the backend on mount: stock may have changed since the items
  // were added, and the cart endpoint recomputes availability on every read.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const unavailable = items.filter((item) => !item.purchasable);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <LoadingState label={t('cart.loading')} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyState
          title={t('cart.empty')}
          description={t('cart.emptyBody')}
          action={<LinkButton to="/shop">{t('home.shopShirts')}</LinkButton>}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold text-ink-900">{t('cart.title')}</h1>
      <p className="mt-1 text-sm text-ink-600">{t('common.itemCount', { count: itemCount })}</p>

      {unavailable.length > 0 && (
        <div role="alert" className="mt-6 rounded-md border border-warn-200 bg-warn-50 px-4 py-3 text-sm text-warn-700">
          <p className="font-medium">{t('cart.unavailableTitle')}</p>
          <ul className="mt-1 list-inside list-disc">
            {unavailable.map((item) => (
              <li key={item.variantId}>
                {t('cart.unavailableLine', { name: item.productName, colour: item.color, size: item.size })}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <Card>
          <ul className="divide-y divide-ink-100">
            {items.map((item) => (
              <li key={item.variantId} className="p-5">
                <CartLine item={item} />
              </li>
            ))}
          </ul>
        </Card>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardBody className="space-y-4">
              <h2 className="text-base font-semibold text-ink-900">{t('cart.orderSummary')}</h2>

              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-600">{t('common.subtotal')}</dt>
                  <dd className="font-medium text-ink-900">{formatMoney(subtotal)}</dd>
                </div>
                <div className="flex justify-between border-t border-ink-200 pt-2 text-base">
                  <dt className="font-semibold text-ink-900">{t('common.total')}</dt>
                  <dd className="font-semibold text-ink-900">{formatMoney(subtotal)}</dd>
                </div>
              </dl>

              <p className="text-xs text-ink-500">
                {t('cart.finalPricing')}
              </p>

              <LinkButton
                to="/checkout"
                fullWidth
                size="lg"
                className={readyForCheckout ? '' : 'pointer-events-none opacity-50'}
              >
                {t('cart.checkout')}
              </LinkButton>

              <Link to="/shop" className="block text-center text-sm text-brand-600 hover:underline">
                {t('cart.continueShopping')}
              </Link>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
