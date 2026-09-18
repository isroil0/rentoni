import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Admin tables never break the page: the wrapper scrolls horizontally on small screens
 * instead of overflowing, and callers can render a card list below `md` where that reads
 * better.
 */
export function TableWrap({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('w-full max-w-full overflow-x-auto', className)}>
      <table className="w-full min-w-[40rem] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wide text-ink-500">{children}</thead>;
}

export function TH({
  children,
  className,
  align = 'left',
  scope = 'col',
}: {
  children?: ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  scope?: 'col' | 'row';
}) {
  return (
    <th
      scope={scope}
      className={cn(
        'px-4 py-2.5 font-medium whitespace-nowrap',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-ink-100">{children}</tbody>;
}

export function TR({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <tr className={cn(onClick && 'cursor-pointer', 'hover:bg-ink-50/70', className)} onClick={onClick}>
      {children}
    </tr>
  );
}

export function TD({
  children,
  className,
  align = 'left',
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        'px-4 py-3 align-middle text-ink-700',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}
