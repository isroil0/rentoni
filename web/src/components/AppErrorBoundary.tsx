import { Component, type ErrorInfo, type ReactNode } from 'react';
import { en, isLocale, ru, uz } from '@/i18n';

/**
 * The boundary deliberately sits OUTSIDE the I18n provider, so that a crash inside the
 * provider itself is still caught. That means it cannot use the hook, so it reads the
 * persisted language directly and falls back to English.
 */
function recoveryCopy() {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem('rentoni.locale');
  } catch {
    /* storage unavailable */
  }
  const messages = isLocale(stored) ? { en, ru, uz }[stored] : en;
  return {
    title: messages.common.somethingWentWrong,
    body: messages.common.unexpectedError,
    action: messages.common.backToHome,
    lang: isLocale(stored) ? stored : 'en',
  };
}

/**
 * Last-resort boundary. A render crash shows a plain recovery screen rather than a
 * blank page — and never the stack trace, which stays in the console for developers.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  override state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error('Unhandled UI error', error, info);
  }

  override render() {
    if (!this.state.hasError) return this.props.children;

    const copy = recoveryCopy();

    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4" lang={copy.lang}>
        <div className="max-w-md rounded-lg border border-ink-200 bg-white p-8 text-center">
          <h1 className="text-lg font-semibold text-ink-900">{copy.title}</h1>
          <p className="mt-2 text-sm text-ink-600">{copy.body}</p>
          <button
            type="button"
            onClick={() => window.location.assign('/')}
            className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-brand-600 px-4 font-medium text-white hover:bg-brand-700"
          >
            {copy.action}
          </button>
        </div>
      </div>
    );
  }
}
