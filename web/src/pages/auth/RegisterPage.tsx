import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ApiError } from '@/lib/apiClient';
import { Button, ErrorBanner, Field, Input } from '@/components/ui';
import { AuthShell } from './AuthShell';
import { useT } from '@/i18n';

/**
 * Customer registration only.
 *
 * The form has no role field, and the backend hard-codes new accounts to CUSTOMER, so
 * there is no path — through this UI or by crafting a request — to self-register as a
 * SUPER_ADMIN.
 */
export default function RegisterPage() {
  const t = useT();
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [error, setError] = useState<unknown>(null);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function set(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function validate(): boolean {
    const issues: Record<string, string> = {};
    if (form.name.trim().length < 2) issues.name = t('auth.validation.name');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) issues.email = t('auth.validation.email');
    if (form.phone && form.phone.trim().length < 5) issues.phone = t('auth.validation.phone');
    if (form.password.length < 8) issues.password = t('auth.validation.passwordShort');
    else if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) {
      issues.password = t('auth.validation.passwordWeak');
    }
    if (form.confirm !== form.password) issues.confirm = t('auth.validation.passwordMismatch');
    setLocalErrors(issues);
    return Object.keys(issues).length === 0;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  // Server-side validation always wins over the local pre-check.
  const serverErrors = error instanceof ApiError ? error.fieldErrors : {};
  const errorFor = (field: string) => serverErrors[field] ?? localErrors[field];

  return (
    <AuthShell
      title={t('auth.registerTitle')}
      subtitle={t('auth.registerSubtitle')}
      footer={
        <>
          {t('auth.alreadyHaveAccount')}{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:underline">
            {t('auth.signIn')}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <ErrorBanner error={error} /> : null}

        <Field label={t('auth.fullName')} required error={errorFor('name')}>
          {(props) => (
            <Input
              {...props}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              autoComplete="name"
              required
              placeholder={t('misc.examples.personName')}
            />
          )}
        </Field>

        <Field label={t('common.email')} required error={errorFor('email')}>
          {(props) => (
            <Input
              {...props}
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          )}
        </Field>

        <Field label={t('common.phone')} error={errorFor('phone')} hint={t('auth.phoneHint')}>
          {(props) => (
            <Input
              {...props}
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              autoComplete="tel"
              placeholder="+1 555 010 0000"
            />
          )}
        </Field>

        <Field
          label={t('common.password')}
          required
          error={errorFor('password')}
          hint={t('auth.passwordHint')}
        >
          {(props) => (
            <Input
              {...props}
              type="password"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              autoComplete="new-password"
              required
            />
          )}
        </Field>

        <Field label={t('auth.confirmPassword')} required error={errorFor('confirm')}>
          {(props) => (
            <Input
              {...props}
              type="password"
              value={form.confirm}
              onChange={(e) => set('confirm', e.target.value)}
              autoComplete="new-password"
              required
            />
          )}
        </Field>

        <Button type="submit" fullWidth size="lg" loading={submitting}>
          {t('nav.createAccount')}
        </Button>
      </form>
    </AuthShell>
  );
}
