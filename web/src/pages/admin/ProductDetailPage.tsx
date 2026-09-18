import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminCatalogApi } from '@/api/adminCatalog.api';
import { qk } from '@/lib/queryClient';
import { formatMoney, formatNumber } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  LinkButton,
  LoadingState,
  StatusBadge,
  TableWrap,
  THead,
  TH,
  TBody,
  TR,
  TD,
  useErrorMessage,
  useToast,
} from '@/components/ui';
import { ProductImage } from '@/components/shop/ProductImage';
import { VariantDialog } from './products/VariantDialog';
import { ImageManager } from './products/ImageManager';
import type { AdminVariant } from '@/api/types';
import { useT } from '@/i18n';

export default function AdminProductDetailPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const { id } = useParams();
  const productId = Number(id);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AdminVariant | null>(null);
  const [creating, setCreating] = useState(false);

  const product = useQuery({
    queryKey: qk.admin.product(productId),
    queryFn: () => AdminCatalogApi.getProduct(productId),
    enabled: Number.isFinite(productId) && productId > 0,
  });

  const toggleVariant = useMutation({
    mutationFn: (variant: AdminVariant) => AdminCatalogApi.updateVariant(variant.id, { active: !variant.active }),
    onSuccess: async () => {
      toast.success(t('admin.variants.updated'));
      await queryClient.invalidateQueries({ queryKey: qk.admin.product(productId) });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (product.isLoading) return <LoadingState label={t('admin.products.loadingProduct')} />;
  if (product.isError || !product.data) {
    return <ErrorState error={product.error} title={t('admin.products.notFound')} />;
  }

  const data = product.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/admin/products" className="text-sm text-brand-600 hover:underline">
            {t('admin.products.backToProducts')}
          </Link>
          <h2 className="mt-2 text-xl font-semibold text-ink-900">{data.name}</h2>
          <p className="mt-1 text-sm text-ink-500">
            {data.brand ? `${data.brand} · ` : ''}
            {data.category?.name} · {t('common.variantCount', { count: data.variantCount })} ·{' '}
            {t('admin.products.unitsInStock', { count: formatNumber(data.totalStock) })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data.active ? (
            <Badge tone="success">{t('admin.products.active')}</Badge>
          ) : (
            <Badge tone="neutral">{t('admin.products.inactive')}</Badge>
          )}
          <LinkButton to={`/admin/products/${data.id}/edit`} variant="secondary">
            {t('admin.products.editProduct')}
          </LinkButton>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <div className="space-y-4">
          <ProductImage
            image={data.images.find((i) => i.isPrimary) ?? data.images[0]}
            alt={data.name}
            className="aspect-[4/5] w-full rounded-lg border border-ink-200"
          />
          {data.description && <p className="text-sm text-ink-600">{data.description}</p>}
          <ImageManager productId={data.id} images={data.images} />
        </div>

        <Card>
          <CardHeader
            title={t('admin.variants.title')}
            description={t('admin.variants.trackedPerVariant')}
            action={<Button onClick={() => setCreating(true)}>{t('admin.variants.addVariant')}</Button>}
          />

          {data.variants.length === 0 ? (
            <EmptyState
              title={t('admin.variants.none')}
              description={t('admin.variants.noneBody')}
              action={<Button onClick={() => setCreating(true)}>{t('admin.variants.addVariant')}</Button>}
            />
          ) : (
            <TableWrap>
              <THead>
                <TR>
                  <TH>{t('common.sku')}</TH>
                  <TH>{t('common.barcode')}</TH>
                  <TH>{t('common.colour')}</TH>
                  <TH>{t('common.size')}</TH>
                  <TH align="right">{t('common.cost')}</TH>
                  <TH align="right">{t('common.price')}</TH>
                  <TH align="right">{t('admin.variants.min')}</TH>
                  <TH align="right">{t('admin.products.stock')}</TH>
                  <TH>{t('common.status')}</TH>
                  <TH align="right">{t('common.actions')}</TH>
                </TR>
              </THead>
              <TBody>
                {data.variants.map((variant) => (
                  <TR key={variant.id}>
                    <TD className="font-mono text-xs font-medium text-ink-900">{variant.sku}</TD>
                    <TD className="font-mono text-xs text-ink-500">{variant.barcode ?? '—'}</TD>
                    <TD>{variant.color}</TD>
                    <TD>{variant.size}</TD>
                    <TD align="right" className="tabular-nums">
                      {formatMoney(variant.costPrice)}
                    </TD>
                    <TD align="right" className="tabular-nums font-medium text-ink-900">
                      {formatMoney(variant.sellingPrice)}
                    </TD>
                    <TD align="right" className="tabular-nums">
                      {variant.minimumStock}
                    </TD>
                    <TD align="right" className="tabular-nums">
                      <Link to={`/admin/inventory/${variant.id}`} className="font-medium hover:text-brand-600">
                        {variant.quantity}
                      </Link>
                    </TD>
                    <TD>
                      <div className="flex flex-col gap-1">
                        <StatusBadge status={variant.stockStatus} />
                        {!variant.active && <Badge tone="neutral">{t('admin.products.inactive')}</Badge>}
                      </div>
                    </TD>
                    <TD align="right">
                      <div className="flex justify-end gap-2 whitespace-nowrap">
                        <button type="button" onClick={() => setEditing(variant)} className="text-sm text-brand-600 hover:underline">
                          {t('common.edit')}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleVariant.mutate(variant)}
                          className="text-sm text-ink-600 hover:underline"
                        >
                          {variant.active ? t('common.deactivate') : t('common.activate')}
                        </button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}

          <CardBody className="border-t border-ink-200 bg-ink-50/60 text-sm text-ink-500">
            {t('admin.products.stockChangedFrom')}{' '}
            <Link to="/admin/inventory" className="text-brand-600 hover:underline">
              {t('admin.nav.inventory')}
            </Link>
            {t('admin.products.stockChangedTo')}
          </CardBody>
        </Card>
      </div>

      <VariantDialog
        open={creating || Boolean(editing)}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        productId={data.id}
        variant={editing}
      />
    </div>
  );
}
