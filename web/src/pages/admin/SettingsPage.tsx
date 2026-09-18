import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SystemApi } from '@/api/system.api';
import { AuthApi } from '@/api/auth.api';
import { qk } from '@/lib/queryClient';
import { setCurrency } from '@/lib/format';
import { useAuth } from '@/hooks/useAuth';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ErrorBanner,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Select,
  useErrorMessage,
  useToast,
} from '@/components/ui';
import { useT } from '@/i18n';

/**
 * Only the settings the backend actually implements are exposed here. Each key maps to
 * a real backend behaviour — nothing on this page is decorative.
 */
const KEYS = {
  storeName: 'store.name',
  currency: 'store.currency',
  exposeStock: 'customer.expose_exact_stock',
  cancelWindow: 'orders.customer_cancel_window_hours',
  returnWindow: 'orders.customer_return_window_days',
} as const;

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'AED', 'INR', 'NGN', 'KES', 'ZAR'];

export default function SettingsPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const settings = useQuery({ queryKey: qk.admin.settings(), queryFn: () => SystemApi.getSettings() });

  const [form, setForm] = useState({
    storeName: '',
    currency: 'USD',
    exposeStock: false,
    cancelWindow: '24',
    returnWindow: '14',
  });

  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data) {
      setForm({
        storeName: settings.data[KEYS.storeName] ?? '',
        currency: settings.data[KEYS.currency] ?? 'USD',
        exposeStock: settings.data[KEYS.exposeStock] === 'true',
        cancelWindow: settings.data[KEYS.cancelWindow] ?? '24',
        returnWindow: settings.data[KEYS.returnWindow] ?? '14',
      });
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () =>
      SystemApi.updateSettings({
        [KEYS.storeName]: form.storeName.trim(),
        [KEYS.currency]: form.currency,
        [KEYS.exposeStock]: String(form.exposeStock),
        [KEYS.cancelWindow]: form.cancelWindow,
        [KEYS.returnWindow]: form.returnWindow,
      }),
    onSuccess: async (updated) => {
      setCurrency(updated[KEYS.currency] ?? 'USD');
      toast.success(t('admin.settings.saved'));
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const changePassword = useMutation({
    mutationFn: () => AuthApi.changePassword(passwords.currentPassword, passwords.newPassword),
    onSuccess: () => {
      toast.success(t('auth.passwordChanged'));
      window.setTimeout(() => window.location.assign('/login'), 1200);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (settings.isLoading) return <LoadingState label={t('admin.settings.loading')} />;
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader title={t('admin.settings.storeInfo')} description={t('admin.settings.storeInfoBody')} />
        <CardBody className="space-y-4">
          {save.isError && <ErrorBanner error={save.error} />}

          <Field label={t('admin.settings.storeName')}>
            {(props) => (
              <Input {...props} value={form.storeName} onChange={(e) => setForm({ ...form, storeName: e.target.value })} />
            )}
          </Field>

          <Field label={t('admin.settings.currency')} hint={t('admin.settings.currencyHint')}>
            {(props) => (
              <Select {...props} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('admin.settings.productSettings')} description={t('admin.settings.productSettingsBody')} />
        <CardBody>
          <Checkbox
            label={t('admin.settings.exposeStock')}
            checked={form.exposeStock}
            onChange={(e) => setForm({ ...form, exposeStock: e.target.checked })}
          />
          <p className="mt-2 text-sm text-ink-500">{t('admin.settings.exposeStockHint')}</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('admin.settings.orderSettings')} description={t('admin.settings.orderSettingsBody')} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label={t('admin.settings.cancelWindow')} hint={t('admin.settings.cancelWindowHint')}>
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                value={form.cancelWindow}
                onChange={(e) => setForm({ ...form, cancelWindow: e.target.value })}
                className="tabular-nums"
              />
            )}
          </Field>
          <Field label={t('admin.settings.returnWindow')} hint={t('admin.settings.returnWindowHint')}>
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                value={form.returnWindow}
                onChange={(e) => setForm({ ...form, returnWindow: e.target.value })}
                className="tabular-nums"
              />
            )}
          </Field>
        </CardBody>
      </Card>

      <Button loading={save.isPending} onClick={() => save.mutate()}>
        {t('admin.settings.saveSettings')}
      </Button>

      <Card>
        <CardHeader title={t('admin.settings.language')} description={t('admin.settings.languageBody')} />
        <CardBody className="space-y-3">
          <LanguageSwitcher variant="segmented" />
          <p className="text-sm text-ink-500">{t('admin.settings.languageHint')}</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('admin.settings.yourAccount')} description={user?.email} />
        <CardBody className="space-y-4">
          <Field label={t('auth.currentPassword')} required>
            {(props) => (
              <Input
                {...props}
                type="password"
                value={passwords.currentPassword}
                onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
                autoComplete="current-password"
              />
            )}
          </Field>
          <Field
            label={t('auth.newPassword')}
            required
            error={passwordError ?? undefined}
            hint={t('auth.passwordHint')}
          >
            {(props) => (
              <Input
                {...props}
                type="password"
                value={passwords.newPassword}
                onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                autoComplete="new-password"
              />
            )}
          </Field>
          <Field label={t('auth.confirmNewPassword')} required>
            {(props) => (
              <Input
                {...props}
                type="password"
                value={passwords.confirm}
                onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                autoComplete="new-password"
              />
            )}
          </Field>
          <Button
            variant="secondary"
            loading={changePassword.isPending}
            onClick={() => {
              setPasswordError(null);
              if (passwords.newPassword.length < 8) return setPasswordError(t('auth.validation.passwordShort'));
              if (!/[A-Za-z]/.test(passwords.newPassword) || !/\d/.test(passwords.newPassword)) {
                return setPasswordError(t('auth.validation.passwordWeak'));
              }
              if (passwords.newPassword !== passwords.confirm) {
                return setPasswordError(t('auth.validation.passwordMismatch'));
              }
              changePassword.mutate();
            }}
          >
            {t('auth.changePassword')}
          </Button>
          <p className="text-xs text-ink-500">{t('auth.signOutEverywhere')}</p>
        </CardBody>
      </Card>
    </div>
  );
}
