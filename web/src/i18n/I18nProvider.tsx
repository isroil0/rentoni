import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en } from './locales/en';
import { ru } from './locales/ru';
import { uz } from './locales/uz';
import { LOCALE_LABELS, isLocale, type Locale } from './types';
import { translate, translateOptional, type Vars } from './translate';
import { setFormattingLocale } from '@/lib/format';

const DICTIONARIES = { en, ru, uz } as const;
const STORAGE_KEY = 'rentoni.locale';

/** Reads a stored choice, else the closest match to the browser's languages. */
function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    /* storage unavailable */
  }

  const candidates = typeof navigator !== 'undefined' ? (navigator.languages ?? [navigator.language]) : [];
  for (const candidate of candidates) {
    const base = candidate?.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return 'en';
}

export type TFunction = (key: string, vars?: Vars) => string;
/** Like `t`, but returns undefined for an absent key and never warns. */
export type TryTFunction = (key: string, vars?: Vars) => string | undefined;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TFunction;
  tryT: TryTFunction;
  /** BCP-47 tag for Intl APIs — "uz-Latn-UZ" rather than the bare "uz". */
  bcp47: string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale ?? detectLocale());

  // Keep <html lang> honest: screen readers and browser translation both rely on it.
  useEffect(() => {
    document.documentElement.lang = locale;
    setFormattingLocale(LOCALE_LABELS[locale].bcp47);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable — the choice just won't persist */
    }
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const messages = DICTIONARIES[locale];
    return {
      locale,
      setLocale,
      bcp47: LOCALE_LABELS[locale].bcp47,
      t: (key, vars) => translate(messages, key, vars, locale),
      tryT: (key, vars) => translateOptional(messages, key, vars, locale),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside an I18nProvider');
  return context;
}

/** The common case: `const t = useT()`. */
export function useT(): TFunction {
  return useI18n().t;
}

/** For callers that probe several keys and treat a miss as normal. */
export function useTryT(): TryTFunction {
  return useI18n().tryT;
}
