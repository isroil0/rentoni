import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { humanize } from '@/lib/format';
import { useTryT } from '@/i18n';
import type { OrderStatus, PaymentStatus, PurchaseStatus, ReturnStatus, StockStatus } from '@/api/types';

type Tone = 'neutral' | 'success' | 'warn' | 'danger' | 'brand';

const TONES: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700 ring-ink-200',
  success: 'bg-success-50 text-success-700 ring-success-200',
  warn: 'bg-warn-50 text-warn-700 ring-warn-200',
  danger: 'bg-danger-50 text-danger-700 ring-danger-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  // order
  PENDING: 'warn',
  CONFIRMED: 'brand',
  PAID: 'brand',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  REFUNDED: 'danger',
  // payment
  UNPAID: 'warn',
  // stock
  IN_STOCK: 'success',
  LOW_STOCK: 'warn',
  OUT_OF_STOCK: 'danger',
  // purchase
  DRAFT: 'neutral',
  RECEIVED: 'success',
  // returns
  REQUESTED: 'warn',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  // source
  POS: 'neutral',
  ONLINE: 'brand',
};

/**
 * Dictionary sections to try, in order, when translating a status code. The same code
 * can mean different things in different contexts (PAID is both an order status and a
 * payment status), but the wording is identical, so first match wins.
 */
const STATUS_NAMESPACES = [
  'orderStatus',
  'paymentStatus',
  'purchaseStatus',
  'returnStatus',
  'stockStatus',
  'orderSource',
] as const;

/**
 * One badge for every status in the system, so a given status always looks the same
 * wherever it appears. The label is always words in the reader's language — colour is
 * never the only signal.
 */
export function StatusBadge({
  status,
  className,
}: {
  status: OrderStatus | PaymentStatus | StockStatus | PurchaseStatus | ReturnStatus | string | null | undefined;
  className?: string;
}) {
  const tryT = useTryT();
  if (!status) return <span className="text-ink-400">—</span>;

  // Probing several namespaces is expected control flow, so use the non-warning lookup.
  const label =
    STATUS_NAMESPACES.map((namespace) => tryT(`${namespace}.${status}`)).find(Boolean) ?? humanize(status);

  return (
    <Badge tone={STATUS_TONES[status] ?? 'neutral'} className={className}>
      {label}
    </Badge>
  );
}
