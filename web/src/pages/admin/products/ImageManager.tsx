import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminCatalogApi } from '@/api/adminCatalog.api';
import { qk } from '@/lib/queryClient';
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, useErrorMessage, useToast } from '@/components/ui';
import { ProductImage } from '@/components/shop/ProductImage';
import type { ProductImage as ProductImageType } from '@/api/types';
import { useT } from '@/i18n';

/**
 * Product images are referenced by URL — the backend deliberately does not store
 * binaries, so this manages the list rather than uploading files.
 */
export function ImageManager({ productId, images }: { productId: number; images: ProductImageType[] }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [altText, setAltText] = useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.admin.product(productId) });

  const addImage = useMutation({
    mutationFn: () =>
      AdminCatalogApi.addImages(productId, [
        { url: url.trim(), altText: altText.trim() || null, isPrimary: images.length === 0 },
      ]),
    onSuccess: async () => {
      setUrl('');
      setAltText('');
      toast.success(t('admin.products.imageAdded'));
      await invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const removeImage = useMutation({
    mutationFn: (imageId: number) => AdminCatalogApi.removeImage(productId, imageId),
    onSuccess: async () => {
      toast.success(t('admin.products.imageRemoved'));
      await invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const setPrimary = useMutation({
    mutationFn: (imageId: number) => AdminCatalogApi.setPrimaryImage(productId, imageId),
    onSuccess: async () => {
      toast.success(t('admin.products.primaryUpdated'));
      await invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Card>
      <CardHeader title={t('common.images')} description={t('admin.products.imagesAttached', { count: images.length })} />
      <CardBody className="space-y-4">
        {images.length > 0 && (
          <ul className="space-y-2">
            {images.map((image) => (
              <li key={image.id} className="flex items-center gap-3 rounded-md border border-ink-200 p-2">
                <ProductImage image={image} alt={image.altText ?? ''} className="h-12 w-10 shrink-0 rounded" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-ink-600">{image.url}</p>
                  {image.isPrimary && (
                    <Badge tone="brand" className="mt-1">
                      {t('admin.products.primary')}
                    </Badge>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-1 text-xs">
                  {!image.isPrimary && (
                    <button
                      type="button"
                      onClick={() => setPrimary.mutate(image.id)}
                      className="text-brand-600 hover:underline"
                    >
                      {t('admin.products.makePrimary')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImage.mutate(image.id)}
                    className="text-danger-600 hover:underline"
                  >
                    {t('common.remove')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3 border-t border-ink-200 pt-4">
          <Field label={t('admin.products.imageUrl')}>
            {(props) => (
              <Input
                {...props}
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://cdn.example.com/shirt.jpg"
              />
            )}
          </Field>
          <Field label={t('admin.products.altText')} hint={t('admin.products.altTextHint')}>
            {(props) => (
              <Input {...props} value={altText} onChange={(e) => setAltText(e.target.value)} placeholder={t('misc.examples.altText')} />
            )}
          </Field>
          <Button
            variant="secondary"
            fullWidth
            disabled={!url.trim()}
            loading={addImage.isPending}
            onClick={() => addImage.mutate()}
          >
            {t('admin.products.addImage')}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
