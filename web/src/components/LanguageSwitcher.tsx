import { useI18n } from '@/i18n';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/i18n';
import { cn } from '@/lib/cn';

/**
 * Language picker. Each option is written in its own language, which is what people
 * scan for — a Russian speaker looks for "Русский", not "Russian".
 */
export function LanguageSwitcher({ variant = 'menu' }: { variant?: 'menu' | 'segmented' }) {
  const { locale, setLocale, t } = useI18n();

  if (variant === 'segmented') {
    return (
      <div
        className="inline-flex rounded-md border border-ink-300 p-0.5"
        role="group"
        aria-label={t('common.changeLanguage')}
      >
        {LOCALES.map((option) => (
          <button
            key={option}
            type="button"
            lang={option}
            onClick={() => setLocale(option)}
            aria-pressed={locale === option}
            className={cn(
              'rounded px-3 py-1.5 text-sm font-medium transition-colors',
              locale === option ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100',
            )}
          >
            {LOCALE_LABELS[option].name}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="language-select" className="sr-only">
        {t('common.changeLanguage')}
      </label>
      <select
        id="language-select"
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        className="h-9 rounded-md border border-ink-300 bg-white px-2 text-sm text-ink-700 hover:border-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
      >
        {LOCALES.map((option) => (
          <option key={option} value={option} lang={option}>
            {LOCALE_LABELS[option].name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Compact globe-and-code control for the storefront header. */
export function LanguageSwitcherCompact() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="group relative">
      <button
        type="button"
        className="flex items-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium text-ink-600 hover:bg-ink-50 hover:text-ink-900"
        aria-haspopup="true"
        aria-label={t('common.changeLanguage')}
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
          <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18Z" stroke="currentColor" strokeWidth="1.7" />
        </svg>
        <span aria-hidden="true">{LOCALE_LABELS[locale].short}</span>
      </button>
      <div className="invisible absolute right-0 top-full z-10 w-36 rounded-md border border-ink-200 bg-white py-1 opacity-0 shadow-md transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        {LOCALES.map((option) => (
          <button
            key={option}
            type="button"
            lang={option}
            onClick={() => setLocale(option)}
            aria-pressed={locale === option}
            className={cn(
              'block w-full px-4 py-2 text-left text-sm hover:bg-ink-50',
              locale === option ? 'font-semibold text-brand-700' : 'text-ink-700',
            )}
          >
            {LOCALE_LABELS[option].name}
          </button>
        ))}
      </div>
    </div>
  );
}
