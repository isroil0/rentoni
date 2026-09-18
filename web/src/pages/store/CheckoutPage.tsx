import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CustomerApi } from '@/api/customer.api';
import { qk } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { ApiError } from '@/lib/apiClient';
import { formatMoney } from '@/lib/format';
import {
  Button,
  Card,
  CardBody,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  LinkButton,
  LoadingState,
  Select,
  Textarea,
  useErrorMessage,
  useToast,
} from '@/components/ui';
import type { PaymentMethod } from '@/api/types';
import { useT } from '@/i18n';

export default function CheckoutPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  /** The payment methods the backend actually accepts — no invented integrations. */
  const PAYMENT_METHODS: { value: PaymentMethod; label: string; hint: string }[] = [
    { value: 'CASH', label: t('payment.cash'), hint: t('payment.cashHint') },
    { value: 'CARD', label: t('payment.card'), hint: t('payment.cardHint') },
    { value: 'OTHER', label: t('payment.other'), hint: t('payment.otherHint') },
  ];
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { items, subtotal, itemCount, isLoading, readyForCheckout, refresh } = useCart();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [shippingPhone, setShippingPhone] = useState(user?.phone ?? '');
  const [note, setNote] = useState('');

  const profile = useQuery({
    queryKey: qk.customer.profile(),
    queryFn: () => CustomerApi.getProfile(),
  });

  useEffect(() => {
    if (profile.data?.phone && !shippingPhone) setShippingPhone(profile.data.phone);
  }, [profile.data, shippingPhone]);

  // Validate the cart against live stock before the customer commits.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const placeOrder = useMutation({
    /**
     * Sends only the cart reference. Price, subtotal, discount, total and stock are all
     * determined by the backend — nothing computed here is trusted.
     */
    mutationFn: () =>
      CustomerApi.placeOrder({
        fromCart: true,
        paymentMethod,
        note: note.trim() || undefined,
        shippingPhone: shippingPhone.trim() || undefined,
      }),
    onSuccess: async (order) => {
      await queryClient.invalidateQueries({ queryKey: qk.cart() });
      await queryClient.invalidateQueries({ queryKey: ['customer'] });
      navigate(`/order-confirmation/${order.id}`, { replace: true, state: { order } });
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.isStockError) {
        // Another shopper took the stock first — tell the truth and resync.
        toast.error(t('checkout.justPurchased'));
      } else {
        toast.error(errorMessage(error));
      }
      await refresh();
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <LoadingState label={t('checkout.preparing')} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyState
          title={t('cart.empty')}
          description={t('checkout.emptyBody')}
          action={<LinkButton to="/shop">{t('home.shopShirts')}</LinkButton>}
        />
      </div>
    );
  }

  const blocked = !readyForCheckout;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold text-ink-900">{t('checkout.title')}</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {/* Order summary */}
          <Card>
            <CardBody>
              <h2 className="text-base font-semibold text-ink-900">{t('cart.orderSummary')}</h2>
              <ul className="mt-4 divide-y divide-ink-100">
                {items.map((item) => (
                  <li key={item.variantId} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900">{item.productName}</p>
                      <p className="text-xs text-ink-500">
                        {item.color} · {item.size} · {t('common.quantity')} {item.quantity}
                      </p>
                      {!item.purchasable && (
                        <p className="mt-1 text-xs font-medium text-danger-600">
                          {t('checkout.noLongerAvailable')}
                        </p>
                      )}
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-medium text-ink-900">{formatMoney(item.lineTotal)}</p>
                      <p className="text-xs text-ink-500">{t('cart.each', { price: formatMoney(item.unitPrice) })}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          {/* Customer information */}
          <Card>
            <CardBody className="space-y-4">
              <h2 className="text-base font-semibold text-ink-900">{t('checkout.yourDetails')}</h2>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-ink-500">{t('common.name')}</dt>
                  <dd className="font-medium text-ink-900">{profile.data?.name ?? user?.name}</dd>
                </div>
                <div>
                  <dt className="text-ink-500">{t('common.email')}</dt>
                  <dd className="font-medium text-ink-900">{profile.data?.email ?? user?.email}</dd>
                </div>
              </dl>

              <Field label={t('checkout.contactPhone')} hint={t('checkout.contactPhoneHint')}>
                {(props) => (
                  <Input
                    {...props}
                    type="tel"
                    value={shippingPhone}
                    onChange={(e) => setShippingPhone(e.target.value)}
                    placeholder="+1 555 010 0000"
                    autoComplete="tel"
                  />
                )}
              </Field>

              <Field label={t('checkout.orderNote')} hint={t('checkout.orderNoteHint')}>
                {(props) => (
                  <Textarea
                    {...props}
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={500}
                    placeholder={t('checkout.orderNotePlaceholder')}
                  />
                )}
              </Field>

              <p className="text-xs text-ink-500">
                {t('checkout.updateProfilePrompt')}{' '}
                <a href="/account" className="text-brand-600 hover:underline">
                  {t('checkout.updateProfileLink')}
                </a>
              </p>
            </CardBody>
          </Card>

          {/* Payment */}
          <Card>
            <CardBody className="space-y-4">
              <h2 className="text-base font-semibold text-ink-900">{t('checkout.paymentMethod')}</h2>
              <Field label={t('checkout.paymentQuestion')} required>
                {(props) => (
                  <Select
                    {...props}
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method.value} value={method.value}>
                        {method.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <p className="text-sm text-ink-500">
                {PAYMENT_METHODS.find((m) => m.value === paymentMethod)?.hint}
              </p>
            </CardBody>
          </Card>
        </div>

        {/* Totals + place order */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardBody className="space-y-4">
              <h2 className="text-base font-semibold text-ink-900">{t('common.total')}</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-600">
                    {t('cart.subtotalWithCount', { count: t('common.itemCount', { count: itemCount }) })}
                  </dt>
                  <dd className="font-medium text-ink-900">{formatMoney(subtotal)}</dd>
                </div>
                <div className="flex justify-between border-t border-ink-200 pt-2 text-base">
                  <dt className="font-semibold text-ink-900">{t('checkout.orderTotal')}</dt>
                  <dd className="font-semibold text-ink-900">{formatMoney(subtotal)}</dd>
                </div>
              </dl>

              <p className="text-xs text-ink-500">
                {t('checkout.storeCalculates')}
              </p>

              {placeOrder.isError && <ErrorBanner error={placeOrder.error} />}

              {blocked && (
                <p className="rounded-md border border-warn-200 bg-warn-50 px-3 py-2 text-xs text-warn-700">
                  {t('checkout.blocked')}
                </p>
              )}

              <Button
                size="lg"
                fullWidth
                disabled={blocked}
                loading={placeOrder.isPending}
                onClick={() => placeOrder.mutate()}
              >
                {t('checkout.placeOrder')}
              </Button>

              <LinkButton to="/cart" variant="secondary" fullWidth>
                {t('checkout.backToCart')}
              </LinkButton>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
