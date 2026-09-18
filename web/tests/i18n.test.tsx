import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider, LOCALES, LOCALE_LABELS, en, ru, uz, selectPlural, interpolate, translate } from '@/i18n';
import type { Locale, PluralForms } from '@/i18n/types';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { AvailabilityBadge } from '@/components/shop/AvailabilityBadge';
import { StatusBadge } from '@/components/ui';
import HomePage from '@/pages/store/HomePage';
import { ToastProvider } from '@/components/ui';

const DICTIONARIES: Record<Locale, unknown> = { en, ru, uz };

/** Walks a dictionary and yields every leaf as [dotPath, value]. */
function leaves(node: unknown, prefix = ''): [string, unknown][] {
  if (typeof node === 'string') return [[prefix, node]];
  if (node && typeof node === 'object' && 'other' in (node as object)) return [[prefix, node]];
  if (!node || typeof node !== 'object') return [];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    leaves(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe('translation completeness', () => {
  const englishKeys = leaves(en).map(([path]) => path).sort();

  it('has a non-trivial number of keys', () => {
    expect(englishKeys.length).toBeGreaterThan(300);
  });

  for (const locale of LOCALES) {
    it(`${locale} covers exactly the same keys as English`, () => {
      const keys = leaves(DICTIONARIES[locale]).map(([path]) => path).sort();
      const missing = englishKeys.filter((key) => !keys.includes(key));
      const extra = keys.filter((key) => !englishKeys.includes(key));

      expect(missing, `missing in ${locale}:\n${missing.join('\n')}`).toEqual([]);
      expect(extra, `extra in ${locale}:\n${extra.join('\n')}`).toEqual([]);
    });

    it(`${locale} has no empty strings`, () => {
      const empty = leaves(DICTIONARIES[locale])
        .filter(([, value]) => typeof value === 'string' && value.trim() === '')
        .map(([path]) => path);
      expect(empty).toEqual([]);
    });

    it(`${locale} keeps every interpolation placeholder used by English`, () => {
      const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      const localeMap = new Map(leaves(DICTIONARIES[locale]));

      const mismatches: string[] = [];
      for (const [path, value] of leaves(en)) {
        if (typeof value !== 'string') continue;
        const expected = placeholders(value);
        if (expected.length === 0) continue;
        const actual = localeMap.get(path);
        if (typeof actual !== 'string') continue;
        // The translation must supply every variable the English string uses, or the
        // rendered text would show a blank where a number or name belongs.
        for (const name of expected) {
          if (!placeholders(actual).includes(name)) mismatches.push(`${path}: missing {${name}}`);
        }
      }
      expect(mismatches).toEqual([]);
    });
  }

  it('is actually translated, not copied from English', () => {
    const englishValues = new Map(leaves(en).filter(([, v]) => typeof v === 'string') as [string, string][]);
    for (const locale of ['ru', 'uz'] as const) {
      const localeValues = new Map(leaves(DICTIONARIES[locale]).filter(([, v]) => typeof v === 'string') as [string, string][]);
      let identical = 0;
      for (const [path, value] of englishValues) {
        if (localeValues.get(path) === value) identical += 1;
      }
      // Some strings legitimately match (brand name, "—", "SKU", "Rentoni"), but the
      // overwhelming majority must differ.
      const ratio = identical / englishValues.size;
      expect(ratio, `${locale} shares ${Math.round(ratio * 100)}% of its strings with English`).toBeLessThan(0.15);
    }
  });
});

describe('pluralisation', () => {
  it('uses the Russian one/few/many forms correctly', () => {
    const forms = ru.common.itemCount as PluralForms;
    expect(selectPlural(forms, 1, 'ru')).toBe('{count} товар');
    expect(selectPlural(forms, 2, 'ru')).toBe('{count} товара');
    expect(selectPlural(forms, 5, 'ru')).toBe('{count} товаров');
    expect(selectPlural(forms, 21, 'ru')).toBe('{count} товар');
    expect(selectPlural(forms, 11, 'ru')).toBe('{count} товаров');
  });

  it('uses one/other for English', () => {
    const forms = en.common.itemCount as PluralForms;
    expect(selectPlural(forms, 1, 'en')).toBe('{count} item');
    expect(selectPlural(forms, 3, 'en')).toBe('{count} items');
  });

  it('resolves a full plural message through translate()', () => {
    expect(translate(ru, 'common.itemCount', { count: 3 }, 'ru')).toBe('3 товара');
    expect(translate(en, 'common.itemCount', { count: 1 }, 'en')).toBe('1 item');
    expect(translate(uz, 'common.itemCount', { count: 7 }, 'uz')).toBe('7 ta mahsulot');
  });
});

describe('interpolation', () => {
  it('substitutes named variables', () => {
    expect(interpolate('Hello {name}, you have {count}', { name: 'Alex', count: 2 })).toBe('Hello Alex, you have 2');
  });

  it('leaves an unknown placeholder visible rather than blanking it', () => {
    expect(interpolate('Hello {missing}', { name: 'Alex' })).toBe('Hello {missing}');
  });
});

describe('missing keys', () => {
  it('returns the key itself so a gap is visible, not blank', () => {
    expect(translate(en, 'does.not.exist', undefined, 'en')).toBe('does.not.exist');
  });
});

function renderWithLocale(ui: React.ReactNode, locale: Locale) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider initialLocale={locale}>
        <ToastProvider>
          <MemoryRouter>{ui}</MemoryRouter>
        </ToastProvider>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe('components render in each language', () => {
  it('translates stock availability', () => {
    const { unmount: a } = renderWithLocale(<AvailabilityBadge status="IN_STOCK" />, 'en');
    expect(screen.getByText('In stock')).toBeInTheDocument();
    a();

    const { unmount: b } = renderWithLocale(<AvailabilityBadge status="IN_STOCK" />, 'ru');
    expect(screen.getByText('В наличии')).toBeInTheDocument();
    b();

    renderWithLocale(<AvailabilityBadge status="IN_STOCK" />, 'uz');
    expect(screen.getByText('Mavjud')).toBeInTheDocument();
  });

  it('translates low stock without revealing an exact count', () => {
    const { unmount } = renderWithLocale(<AvailabilityBadge status="LOW_STOCK" />, 'ru');
    expect(screen.getByText('Осталось мало')).toBeInTheDocument();
    unmount();

    renderWithLocale(<AvailabilityBadge status="LOW_STOCK" quantity={3} />, 'ru');
    expect(screen.getByText('Осталось всего 3')).toBeInTheDocument();
  });

  it('translates order status badges', () => {
    const { unmount } = renderWithLocale(<StatusBadge status="PENDING" />, 'ru');
    expect(screen.getByText('В ожидании')).toBeInTheDocument();
    unmount();

    renderWithLocale(<StatusBadge status="COMPLETED" />, 'uz');
    expect(screen.getByText('Yakunlangan')).toBeInTheDocument();
  });

  it('renders the home page in every language', async () => {
    for (const [locale, heading] of [
      ['en', 'Find your perfect shirt'],
      ['ru', 'Найдите свою рубашку'],
      ['uz', 'O‘zingizga mos ko‘ylakni toping'],
    ] as const) {
      const { unmount } = renderWithLocale(<HomePage />, locale);
      await waitFor(() => expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument());
      unmount();
    }
  });
});

describe('language switcher', () => {
  it('changes the language and persists the choice', async () => {
    renderWithLocale(
      <>
        <LanguageSwitcher variant="segmented" />
        <AvailabilityBadge status="IN_STOCK" />
      </>,
      'en',
    );

    expect(screen.getByText('In stock')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: LOCALE_LABELS.ru.name }));

    await waitFor(() => expect(screen.getByText('В наличии')).toBeInTheDocument());
    expect(localStorage.getItem('rentoni.locale')).toBe('ru');
    expect(document.documentElement.lang).toBe('ru');
  });

  it('labels each option in its own language', () => {
    renderWithLocale(<LanguageSwitcher variant="segmented" />, 'en');
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Русский' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "O'zbekcha" })).toBeInTheDocument();
  });
});
