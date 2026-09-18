import type { Locale, MessageValue, PluralForms } from './types';
import { LOCALE_LABELS } from './types';

export type Vars = Record<string, string | number>;

/** Cached because constructing PluralRules on every render is measurable. */
const pluralRules = new Map<Locale, Intl.PluralRules>();

function rulesFor(locale: Locale): Intl.PluralRules {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(LOCALE_LABELS[locale].bcp47);
    pluralRules.set(locale, rules);
  }
  return rules;
}

function isPlural(value: MessageValue): value is PluralForms {
  return typeof value === 'object' && value !== null && 'other' in value;
}

/**
 * Picks the right plural form for the count.
 *
 * Russian genuinely needs this: 1 товар / 2 товара / 5 товаров. Falling back through
 * the CLDR categories to `other` means a dictionary only has to spell out the forms its
 * language actually uses.
 */
export function selectPlural(forms: PluralForms, count: number, locale: Locale): string {
  if (count === 0 && forms.zero !== undefined) return forms.zero;
  const category = rulesFor(locale).select(count);
  return (
    forms[category as keyof PluralForms] ??
    forms.other
  );
}

/** Replaces `{name}` placeholders. An unknown placeholder is left visible, not blanked. */
export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

/** Walks a dot path through the dictionary. */
function lookup(messages: unknown, path: string): MessageValue | undefined {
  let current: unknown = messages;
  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'string' || isPluralLike(current) ? (current as MessageValue) : undefined;
}

function isPluralLike(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'other' in (value as object);
}

/**
 * Resolves a key, or returns undefined if it is absent — without logging.
 *
 * Used where a caller deliberately probes several namespaces (a status code can live
 * under `orderStatus`, `stockStatus`, …), so a miss is expected control flow rather
 * than a gap in the dictionary.
 */
export function translateOptional(
  messages: unknown,
  key: string,
  vars: Vars | undefined,
  locale: Locale,
): string | undefined {
  const value = lookup(messages, key);
  if (value === undefined) return undefined;

  if (isPlural(value)) {
    const count = typeof vars?.count === 'number' ? vars.count : 0;
    return interpolate(selectPlural(value, count, locale), vars);
  }

  return interpolate(value, vars);
}

/**
 * Resolves a key to a display string. If a key is somehow absent the key itself is
 * returned, so a gap shows up as visible text rather than an empty layout.
 */
export function translate(messages: unknown, key: string, vars: Vars | undefined, locale: Locale): string {
  const resolved = translateOptional(messages, key, vars, locale);
  if (resolved === undefined) {
    if (import.meta.env.DEV) console.warn(`[i18n] missing key "${key}" for locale "${locale}"`);
    return key;
  }
  return resolved;
}
