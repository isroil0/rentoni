/**
 * Message shape.
 *
 * `en.ts` is the source of truth: `Messages` is derived from its *structure*, so the
 * Russian and Uzbek dictionaries fail to compile if a key is missing, misspelt, or
 * added on only one side. There is no runtime "missing translation" surprise.
 */

/**
 * CLDR plural categories. Which ones a language actually uses is decided by
 * `Intl.PluralRules` — Russian needs one/few/many, Uzbek and English only one/other.
 */
export interface PluralForms {
  zero?: string;
  one: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

export type MessageValue = string | PluralForms;

/** Maps a concrete dictionary onto its shape, keeping plural entries plural. */
export type MessageShape<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends PluralForms
      ? PluralForms
      : MessageShape<T[K]>;
};

export const LOCALES = ['en', 'ru', 'uz'] as const;
export type Locale = (typeof LOCALES)[number];

/** Display names are written in their own language, as language pickers should be. */
export const LOCALE_LABELS: Record<Locale, { name: string; short: string; bcp47: string }> = {
  en: { name: 'English', short: 'EN', bcp47: 'en-US' },
  ru: { name: 'Русский', short: 'RU', bcp47: 'ru-RU' },
  uz: { name: "O'zbekcha", short: 'UZ', bcp47: 'uz-Latn-UZ' },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
