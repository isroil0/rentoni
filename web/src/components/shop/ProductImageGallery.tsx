import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { ProductImage } from './ProductImage';
import type { ProductImage as ProductImageType } from '@/api/types';
import { useT } from '@/i18n';

/** Large image plus keyboard-navigable thumbnails. */
export function ProductImageGallery({ images, productName }: { images: ProductImageType[]; productName: string }) {
  const t = useT();
  const ordered = [...images].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder,
  );
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [productName]);

  const active = ordered[activeIndex] ?? ordered[0];

  return (
    <div className="space-y-3">
      <ProductImage
        image={active}
        alt={productName}
        loading="eager"
        sizes="(min-width: 1024px) 40vw, 100vw"
        className="aspect-[4/5] w-full rounded-lg border border-ink-200"
      />

      {ordered.length > 1 && (
        <div className="grid grid-cols-5 gap-2" role="group" aria-label={t('product.images', { name: productName })}>
          {ordered.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={t('product.viewImage', { index: index + 1, total: ordered.length })}
              aria-current={index === activeIndex}
              className={cn(
                'overflow-hidden rounded-md border transition-colors',
                index === activeIndex ? 'border-brand-600 ring-1 ring-brand-600' : 'border-ink-200 hover:border-ink-400',
              )}
            >
              <ProductImage image={image} alt="" className="aspect-square w-full" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
