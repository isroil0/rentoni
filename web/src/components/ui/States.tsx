import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { Spinner } from './Spinner';
import { ApiError } from '@/lib/apiClient';
import { useT, useTryT } from '@/i18n';

/** Grey block used to build page-shaped skeletons while data loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-ink-100', className)} aria-hidden="true" />;
}

/** Resolves an error to localised copy, falling back to the generic message. */
export function useErrorMessage(): (error: unknown) => string {
  const t = useT();
  const tryT = useTryT();
  return (error: unknown) => {
    const code = error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
    // An unmapped backend code is normal — fall back rather than warn about it.
    return tryT(`errors.${code}`) ?? t('errors.INTERNAL_ERROR');
  };
}

export function LoadingState({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-16 text-ink-500', className)} role="status">
      <Spinner className="h-6 w-6 text-brand-600" />
      <p className="text-sm">{label ?? <DefaultLoadingLabel />}</p>
    </div>
  );
}

function DefaultLoadingLabel() {
  return <>{useT()('common.loading')}</>;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      {icon && <div className="mb-4 text-ink-300">{icon}</div>}
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * Renders a safe, human message for any failure. Stack traces and internal API detail
 * are never surfaced — `friendlyMessage` maps error codes to store-appropriate copy.
 */
export function ErrorState({
  error,
  onRetry,
  title,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  className?: string;
}) {
  const t = useT();
  const message = useErrorMessage();
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)} role="alert">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-danger-50 text-danger-600">
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
          <path
            d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-ink-900">{title ?? t('common.somethingWentWrong')}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-ink-500">{message(error)}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-5" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}

/** Inline banner for form-level or contextual errors. */
export function ErrorBanner({ error, className }: { error: unknown; className?: string }) {
  const message = useErrorMessage();
  if (!error) return null;
  return (
    <div
      role="alert"
      className={cn('rounded-md border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700', className)}
    >
      {message(error)}
    </div>
  );
}
