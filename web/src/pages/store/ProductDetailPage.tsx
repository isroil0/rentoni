import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CatalogApi } from '@/api/catalog.api';
import { qk } from '@/lib/queryClient';
import { useCart } from '@/hooks/useCart';
import { ProductImageGallery } from '@/components/shop/ProductImageGallery';
import { VariantSelector, findVariant } from '@/components/shop/VariantSelector';
import { QuantitySelector } from '@/components/shop/QuantitySelector';
import { AvailabilityBadge } from '@/components/shop/AvailabilityBadge';
import { PriceDisplay } from '@/components/shop/PriceDisplay';
import { Button, ErrorState, LoadingState, Skeleton, useErrorMessage, useToast } from '@/components/ui';
import { useT } from '@/i18n';

export default function ProductDetailPage() {
  const { id } = useParams();
  const productId = Number(id);
  const navigate = useNavigate();
  const t = useT();
  const errorMessage = useErrorMessage();
  const toast = useToast();
  const { addItem, refresh } = useCart();

  const [color, setColor] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);

  const product = useQuery({
    queryKey: qk.catalog.product(productId),
    queryFn: () => CatalogApi.getProduct(productId),
    enabled: Number.isFinite(productId) && productId > 0,
  });

  // Preselect the first colour that has stock, so the common case needs one tap.
  useEffect(() => {
    const variants = product.data?.variants ?? [];
    if (variants.length === 0 || color) return;
    const firstAvailable = variants.find((v) => v.inStock) ?? variants[0]!;
    setColor(firstAvailable.color);
    setSize(firstAvailable.size);
  }, [product.data, color]);

  const selected = useMemo(
    () => findVariant(product.data?.variants ?? [], color, size),
    [product.data, color, size],
  );

  // When the colour changes, keep the size if that combination exists, otherwise move
  // to the first size available in the new colour.
  function handleColorChange(nextColor: string) {
    setColor(nextColor);
    const variants = product.data?.variants ?? [];
    const sameSize = variants.find((v) => v.color === nextColor && v.size === size);
    if (!sameSize) {
      const fallback = variants.find((v) => v.color === nextColor && v.inStock) ?? variants.find((v) => v.color === nextColor);
      setSize(fallback?.size ?? null);
    }
    setQuantity(1);
  }

  async function handleAddToCart() {
    if (!selected || !product.data) return;
    setAdding(true);
    try {
      await addItem({ variantId: selected.id, productId: product.data.id, quantity });
      toast.success(
        t('product.addedToCart', {
          name: product.data.name,
          colour: selected.color,
          size: selected.size,
        }),
      );
    } catch (error) {
      toast.error(errorMessage(error));
      // Stock may have moved underneath us — pull fresh data for both cart and product.
      await Promise.all([refresh(), product.refetch()]);
    } finally {
      setAdding(false);
    }
  }

  if (product.isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2">
          <Skeleton className="aspect-[4/5] w-full" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
        <LoadingState label={t('product.loading')} />
      </div>
    );
  }

  if (product.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <ErrorState
          error={product.error}
          title={t('product.notFound')}
          onRetry={() => void product.refetch()}
        />
        <div className="text-center">
          <Button variant="secondary" onClick={() => navigate('/shop')}>
            {t('product.backToShop')}
          </Button>
        </div>
      </div>
    );
  }

  const data = product.data!;
  const outOfStock = selected ? !selected.inStock : data.availability === 'OUT_OF_STOCK';
  const maxQuantity = selected?.quantity ?? 99;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav aria-label={t('misc.breadcrumb')} className="mb-6 text-sm text-ink-500">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link to="/shop" className="hover:text-ink-900">
              {t('nav.shop')}
            </Link>
          </li>
          {data.category && (
            <>
              <li aria-hidden="true">/</li>
              <li>
                <Link to={`/shop?categoryId=${data.category.id}`} className="hover:text-ink-900">
                  {data.category.name}
                </Link>
              </li>
            </>
          )}
          <li aria-hidden="true">/</li>
          <li className="text-ink-900">{data.name}</li>
        </ol>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        <ProductImageGallery images={data.images} productName={data.name} />

        <div>
          {data.brand && <p className="text-sm uppercase tracking-wide text-ink-400">{data.brand}</p>}
          <h1 className="mt-1 text-2xl font-semibold text-ink-900 sm:text-3xl">{data.name}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <PriceDisplay
              price={selected?.price}
              priceFrom={data.priceFrom}
              priceTo={data.priceTo}
              className="text-2xl"
            />
            <AvailabilityBadge
              status={selected?.availability ?? data.availability}
              quantity={selected?.quantity}
            />
          </div>

          {data.description && <p className="mt-5 text-ink-600">{data.description}</p>}

          <div className="mt-7">
            <VariantSelector
              variants={data.variants}
              color={color}
              size={size}
              onColorChange={handleColorChange}
              onSizeChange={(nextSize) => {
                setSize(nextSize);
                setQuantity(1);
              }}
            />
          </div>

          <div className="mt-7 flex flex-wrap items-end gap-4">
            <div>
              <span className="mb-2 block text-sm font-medium text-ink-700">{t('common.quantity')}</span>
              <QuantitySelector
                value={quantity}
                onChange={setQuantity}
                max={Math.max(1, maxQuantity)}
                disabled={outOfStock || !selected}
              />
            </div>

            <Button
              size="lg"
              className="flex-1 sm:flex-none sm:px-10"
              disabled={!selected || outOfStock}
              loading={adding}
              onClick={() => void handleAddToCart()}
            >
              {outOfStock ? t('product.outOfStock') : t('product.addToCart')}
            </Button>
          </div>

          {selected && (
            <p className="mt-3 text-sm text-ink-500">
              {t('product.selected')} <span className="font-medium text-ink-700">{selected.color}</span> ·{' '}
              <span className="font-medium text-ink-700">{selected.size}</span>
            </p>
          )}

          {!selected && color && size && (
            <p className="mt-3 text-sm text-danger-600">{t('product.unavailableCombo')}</p>
          )}

          <dl className="mt-8 space-y-2 border-t border-ink-200 pt-6 text-sm">
            {data.category && (
              <div className="flex gap-2">
                <dt className="text-ink-500">{t('common.category')}</dt>
                <dd className="text-ink-800">{data.category.name}</dd>
              </div>
            )}
            <div className="flex gap-2">
              <dt className="text-ink-500">{t('product.colours')}</dt>
              <dd className="text-ink-800">{data.colors.join(', ')}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-500">{t('product.sizes')}</dt>
              <dd className="text-ink-800">{data.sizes.join(', ')}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
