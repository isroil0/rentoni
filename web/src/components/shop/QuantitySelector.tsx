import { cn } from '@/lib/cn';
import { useT } from '@/i18n';

/**
 * Quantity stepper. Clamps to a sane range in the UI, but the backend remains the
 * authority on whether the quantity can actually be fulfilled.
 */
export function QuantitySelector({
  value,
  onChange,
  min = 1,
  max = 999,
  disabled = false,
  label,
  size = 'md',
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  label?: string;
  size?: 'sm' | 'md';
}) {
  const t = useT();
  const resolvedLabel = label ?? t('common.quantity');
  const clamp = (next: number) => Math.max(min, Math.min(max, Math.trunc(next) || min));
  const dimensions = size === 'sm' ? 'h-8 w-8 text-sm' : 'h-10 w-10';
  const field = size === 'sm' ? 'h-8 w-12 text-sm' : 'h-10 w-14';

  return (
    <div className="inline-flex items-stretch rounded-md border border-ink-300 bg-white">
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={disabled || value <= min}
        aria-label={t('common.decrease', { label: resolvedLabel.toLowerCase() })}
        className={cn(
          dimensions,
          'flex items-center justify-center rounded-l-md text-ink-600 hover:bg-ink-50 disabled:text-ink-300 disabled:hover:bg-transparent',
        )}
      >
        <span aria-hidden="true">−</span>
      </button>

      <input
        type="number"
        inputMode="numeric"
        aria-label={resolvedLabel}
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!Number.isNaN(next)) onChange(clamp(next));
        }}
        className={cn(
          field,
          'border-x border-ink-300 text-center font-medium text-ink-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500/25 disabled:bg-ink-50',
        )}
      />

      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={disabled || value >= max}
        aria-label={t('common.increase', { label: resolvedLabel.toLowerCase() })}
        className={cn(
          dimensions,
          'flex items-center justify-center rounded-r-md text-ink-600 hover:bg-ink-50 disabled:text-ink-300 disabled:hover:bg-transparent',
        )}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}
