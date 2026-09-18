/**
 * Display formatting only. Every monetary value shown in the UI comes from the backend
 * already computed — the frontend never derives totals, discounts or profit itself.
 */

let currencyCode = 'USD';
/** BCP-47 tag driving number, currency and date formatting. Set by the I18n provider. */
let formattingLocale: string | undefined;

/** Set once from the store settings so the whole UI formats consistently. */
export function setCurrency(code: string) {
  if (code) currencyCode = code;
}

/** Called whenever the interface language changes. */
export function setFormattingLocale(locale: string) {
  formattingLocale = locale;
}

export function getFormattingLocale(): string | undefined {
  return formattingLocale;
}

export function formatMoney(value: number | null | undefined): string {
  const amount = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat(formattingLocale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currencyCode}`;
  }
}

export function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat(formattingLocale).format(typeof value === 'number' ? value : 0);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(formattingLocale, { dateStyle: 'medium' }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(formattingLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/** "PENDING" -> "Pending", "OUT_OF_STOCK" -> "Out of stock" */
export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  const lower = value.replace(/_/g, ' ').toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Today's date as YYYY-MM-DD in the user's timezone, for date inputs. */
export function todayISO(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}
