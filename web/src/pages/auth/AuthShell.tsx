import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

/** Shared frame for the sign-in and registration screens. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-ink-50">
      <header className="flex items-center justify-between px-4 py-6 sm:px-6">
        <Link to="/" className="inline-flex items-center gap-2 text-lg font-semibold text-ink-900">
          <span className="flex h-8 w-8 items-center justify-center rounded bg-ink-900 text-sm font-bold text-white">
            R
          </span>
          Rentoni
        </Link>
        <LanguageSwitcher />
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:items-center sm:pt-0">
        <div className="w-full max-w-md">
          <div className="rounded-lg border border-ink-200 bg-white p-6 sm:p-8">
            <h1 className="text-xl font-semibold text-ink-900">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-ink-600">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
          {footer && <p className="mt-5 text-center text-sm text-ink-600">{footer}</p>}
        </div>
      </main>
    </div>
  );
}
