import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ApiError } from '@/lib/apiClient';
import { Button, ErrorBanner, Field, Input, useErrorMessage } from '@/components/ui';
import { AuthShell } from './AuthShell';
import { useT } from '@/i18n';

export default function LoginPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(email.trim(), password);
      // Admins land in the back office; customers resume whatever they were doing.
      navigate(user.role === 'SUPER_ADMIN' ? '/admin' : (from ?? '/'), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  const fieldErrors = error instanceof ApiError ? error.fieldErrors : {};

  return (
    <AuthShell
      title={t('auth.signIn')}
      subtitle={t('auth.signInSubtitle')}
      footer={
        <>
          {t('auth.newHere')}{' '}
          <Link to="/register" className="font-medium text-brand-600 hover:underline">
            {t('auth.createAnAccount')}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <ErrorBanner error={error} /> : null}

        <Field label={t('common.email')} required error={fieldErrors.email}>
          {(props) => (
            <Input
              {...props}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          )}
        </Field>

        <Field label={t('common.password')} required error={fieldErrors.password}>
          {(props) => (
            <Input
              {...props}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              placeholder="••••••••"
            />
          )}
        </Field>

        <Button type="submit" fullWidth size="lg" loading={submitting}>
          {t('auth.signIn')}
        </Button>

        <p className="sr-only" role="status">
          {error ? errorMessage(error) : ''}
        </p>
      </form>
    </AuthShell>
  );
}
