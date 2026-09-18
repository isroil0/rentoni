import { useState } from 'react';
import { cn } from '@/lib/cn';
import type { ProductImage as ProductImageType } from '@/api/types';

/**
 * Product imagery with a graceful fallback.
 *
 * Image URLs come from the backend and may point at a CDN that is unreachable in a
 * given environment. Rather than showing a broken-image icon, we fall back to a neutral
 * shirt mark so the grid keeps its shape and the product stays shoppable.
 */
export function ProductImage({
  image,
  alt,
  className,
  sizes,
  loading = 'lazy',
}: {
  image?: ProductImageType | null;
  alt: string;
  className?: string;
  sizes?: string;
  loading?: 'lazy' | 'eager';
}) {
  const [failed, setFailed] = useState(false);
  const showImage = image?.url && !failed;

  return (
    <div className={cn('relative overflow-hidden bg-ink-50', className)}>
      {showImage ? (
        <img
          src={image.url}
          alt={image.altText || alt}
          sizes={sizes}
          loading={loading}
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center" role="img" aria-label={alt}>
          <ShirtMark className="h-1/3 w-1/3 max-h-24 max-w-24 text-ink-300" />
        </div>
      )}
    </div>
  );
}

export function ShirtMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <path
        d="M18 6 24 11l6-5 9 4.5a2 2 0 0 1 1.1 2.3L38 22l-4-1.5V42H14V20.5L10 22 6.9 12.8A2 2 0 0 1 8 10.5L18 6Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M18 6a6 6 0 0 0 12 0" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
