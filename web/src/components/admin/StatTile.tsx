import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Stat tile: label (sentence case), value, optional supporting line.
 * The value uses proportional figures — tabular-nums is for columns of numbers, not
 * for a single display figure.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
  action,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'neutral' | 'warn' | 'danger' | 'success';
  action?: ReactNode;
}) {
  const accents = {
    neutral: 'text-ink-900',
    warn: 'text-warn-700',
    danger: 'text-danger-700',
    success: 'text-success-700',
  };

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4">
      <p className="text-sm text-ink-500">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold', accents[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function StatTileSkeleton() {
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4" aria-hidden="true">
      <div className="h-4 w-24 animate-pulse rounded bg-ink-100" />
      <div className="mt-2 h-7 w-20 animate-pulse rounded bg-ink-100" />
    </div>
  );
}
