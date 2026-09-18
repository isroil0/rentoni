import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CustomerApi } from '@/api/customer.api';
import { AuthApi } from '@/api/auth.api';
import { qk } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { ApiError } from '@/lib/apiClient';
import { formatDate } from '@/lib/format';
import {
  Button,
  Card,
  CardBody,
  ErrorBanner,
  ErrorState,
  Field,
  Input,
  LoadingState,
  useErrorMessage,
  useToast,
} from '@/components/ui';
import { useT } from '@/i18n';

export default function ProfilePage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { setUser } = useAuth();

  const profile = useQuery({ queryKey: qk.customer.profile(), queryFn: () => CustomerApi.getProfile() });

  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (profile.data) {
      setForm({ name: profile.data.name, email: profile.data.email, phone: profile.data.phone ?? '' });
    }
  }, [profile.data]);

  const updateProfile = useMutation({
    mutationFn: () =>
      CustomerApi.updateProfile({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
      }),
    onSuccess: (user) => {
      setUser(user);
      queryClient.setQueryData(qk.customer.profile(), user);
      toast.success(t('account.profileUpdated'));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const changePassword = useMutation({
    mutationFn: () => AuthApi.changePassword(passwords.currentPassword, passwords.newPassword),
    onSuccess: () => {
      setPasswords({ currentPassword: '', newPassword: '', confirm: '' });
      // The backend revokes every session on a password change, so ask for a new sign-in.
      toast.success(t('auth.passwordChanged'));
      window.setTimeout(() => window.location.assign('/login'), 1200);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (profile.isLoading) return <LoadingState label={t('account.loadingProfile')} />;
  if (profile.isError || !profile.data) return <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />;

  const fieldErrors = updateProfile.error instanceof ApiError ? updateProfile.error.fieldErrors : {};

  function submitProfile(event: FormEvent) {
    event.preventDefault();
    updateProfile.mutate();
  }

  function submitPassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    if (passwords.newPassword.length < 8) {
      setPasswordError(t('auth.validation.passwordShort'));
      return;
    }
    if (!/[A-Za-z]/.test(passwords.newPassword) || !/\d/.test(passwords.newPassword)) {
      setPasswordError(t('auth.validation.passwordWeak'));
      return;
    }
    if (passwords.newPassword !== passwords.confirm) {
      setPasswordError(t('auth.validation.passwordMismatch'));
      return;
    }
    changePassword.mutate();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardBody>
          <h2 className="text-base font-semibold text-ink-900">{t('account.profile')}</h2>
          <p className="mt-1 text-sm text-ink-500">{t('account.memberSince', { date: formatDate(profile.data.createdAt) })}</p>

          <form onSubmit={submitProfile} className="mt-5 space-y-4" noValidate>
            {updateProfile.isError && <ErrorBanner error={updateProfile.error} />}

            <Field label={t('auth.fullName')} required error={fieldErrors.name}>
              {(props) => (
                <Input
                  {...props}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  autoComplete="name"
                  required
                />
              )}
            </Field>

            <Field label={t('common.email')} required error={fieldErrors.email}>
              {(props) => (
                <Input
                  {...props}
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  autoComplete="email"
                  required
                />
              )}
            </Field>

            <Field label={t('common.phone')} error={fieldErrors.phone}>
              {(props) => (
                <Input
                  {...props}
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  autoComplete="tel"
                />
              )}
            </Field>

            <Button type="submit" loading={updateProfile.isPending}>
              {t('common.saveChanges')}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="text-base font-semibold text-ink-900">{t('auth.changePassword')}</h2>
          <p className="mt-1 text-sm text-ink-500">{t('auth.signOutEverywhere')}</p>

          <form onSubmit={submitPassword} className="mt-5 space-y-4" noValidate>
            {changePassword.isError && <ErrorBanner error={changePassword.error} />}

            <Field label={t('auth.currentPassword')} required>
              {(props) => (
                <Input
                  {...props}
                  type="password"
                  value={passwords.currentPassword}
                  onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
                  autoComplete="current-password"
                  required
                />
              )}
            </Field>

            <Field label={t('auth.newPassword')} required error={passwordError ?? undefined} hint={t('auth.passwordHint')}>
              {(props) => (
                <Input
                  {...props}
                  type="password"
                  value={passwords.newPassword}
                  onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                  autoComplete="new-password"
                  required
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
                  required
                />
              )}
            </Field>

            <Button type="submit" variant="secondary" loading={changePassword.isPending}>
              {t('auth.changePassword')}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
