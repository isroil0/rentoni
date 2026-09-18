import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import type { CustomerVariant } from '@/api/types';
import { useT } from '@/i18n';

/**
 * Colour + size selection.
 *
 * Sizes are offered per colour, so a combination that does not exist can never be
 * picked. Combinations that exist but are sold out stay visible and selectable — the
 * shopper should be able to see that "White / M" is a real size that happens to be out
 * of stock, and the Add to Cart button then explains why it is disabled.
 */
export function VariantSelector({
  variants,
  color,
  size,
  onColorChange,
  onSizeChange,
}: {
  variants: CustomerVariant[];
  color: string | null;
  size: string | null;
  onColorChange: (color: string) => void;
  onSizeChange: (size: string) => void;
}) {
  const t = useT();
  const colors = useMemo(() => [...new Set(variants.map((v) => v.color))], [variants]);

  const sizesForColor = useMemo(() => {
    const relevant = color ? variants.filter((v) => v.color === color) : variants;
    const seen = new Map<string, boolean>();
    for (const variant of relevant) {
      seen.set(variant.size, (seen.get(variant.size) ?? false) || variant.inStock);
    }
    return [...seen.entries()].map(([value, inStock]) => ({ value, inStock }));
  }, [variants, color]);

  const colorHasStock = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const variant of variants) {
      map.set(variant.color, (map.get(variant.color) ?? false) || variant.inStock);
    }
    return map;
  }, [variants]);

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink-700">
          {t('common.colour')}
          {color && <span className="ml-1.5 font-normal text-ink-500">{color}</span>}
        </legend>
        <div className="flex flex-wrap gap-2">
          {colors.map((option) => {
            const selected = option === color;
            const hasStock = colorHasStock.get(option) ?? false;
            return (
              <button
                key={option}
                type="button"
                onClick={() => onColorChange(option)}
                aria-pressed={selected}
                className={cn(
                  'min-w-20 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                  selected
                    ? 'border-brand-600 bg-brand-50 text-brand-700 ring-1 ring-brand-600'
                    : 'border-ink-300 bg-white text-ink-700 hover:border-ink-400',
                  !hasStock && 'text-ink-400',
                )}
              >
                {option}
                {!hasStock && <span className="sr-only"> {t('product.soldOut')}</span>}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink-700">
          {t('common.size')}
          {size && <span className="ml-1.5 font-normal text-ink-500">{size}</span>}
        </legend>
        <div className="flex flex-wrap gap-2">
          {sizesForColor.map(({ value, inStock }) => {
            const selected = value === size;
            return (
              <button
                key={value}
                type="button"
                onClick={() => onSizeChange(value)}
                aria-pressed={selected}
                className={cn(
                  'min-w-14 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                  selected
                    ? 'border-brand-600 bg-brand-50 text-brand-700 ring-1 ring-brand-600'
                    : 'border-ink-300 bg-white text-ink-700 hover:border-ink-400',
                  !inStock && 'text-ink-400 line-through decoration-ink-300',
                )}
              >
                {value}
                {!inStock && <span className="sr-only"> {t('stock.outOfStock')}</span>}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

/** Finds the variant matching the chosen colour and size, if one exists. */
export function findVariant(
  variants: CustomerVariant[],
  color: string | null,
  size: string | null,
): CustomerVariant | null {
  if (!color || !size) return null;
  return variants.find((v) => v.color === color && v.size === size) ?? null;
}
