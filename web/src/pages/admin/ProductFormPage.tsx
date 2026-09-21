import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminCatalogApi, type VariantInput } from '@/api/adminCatalog.api';
import { qk } from '@/lib/queryClient';
import { ApiError } from '@/lib/apiClient';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ErrorBanner,
  Field,
  Input,
  LoadingState,
  Textarea,
  useErrorMessage,
  useToast,
} from '@/components/ui';
import { VariantMatrixBuilder } from './products/VariantMatrixBuilder';
import { useT } from '@/i18n';

/** Create and edit a product. On create, the variant matrix can be built in the same step. */
export default function ProductFormPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const { id } = useParams();
  const isEdit = Boolean(id) && id !== 'new';
  const productId = Number(id);
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    name: '',
    description: '',
    brand: '',
    active: true,
  });
  const [imageUrls, setImageUrls] = useState('');
  const [variants, setVariants] = useState<VariantInput[]>([]);


  const existing = useQuery({
    queryKey: qk.admin.product(productId),
    queryFn: () => AdminCatalogApi.getProduct(productId),
    enabled: isEdit && Number.isFinite(productId),
  });

  useEffect(() => {
    if (existing.data) {
      setForm({
        name: existing.data.name,
        description: existing.data.description ?? '',
        brand: existing.data.brand ?? '',
        active: existing.data.active,
      });
    }
  }, [existing.data]);

  const save = useMutation({
    mutationFn: async () => {
      const base = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        brand: form.brand.trim() || null,
        active: form.active,
      };

      if (isEdit) return AdminCatalogApi.updateProduct(productId, base);

      const images = imageUrls
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((url, index) => ({ url, altText: form.name.trim(), sortOrder: index, isPrimary: index === 0 }));

      return AdminCatalogApi.createProduct({
        ...base,
        images: images.length ? images : undefined,
        variants: variants.length ? variants : undefined,
      });
    },
    onSuccess: async (product) => {
      toast.success(isEdit ? t('admin.products.updated') : t('admin.products.created'));
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      navigate(`/admin/products/${product.id}`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (isEdit && existing.isLoading) return <LoadingState label={t('admin.products.loadingProduct')} />;

  const fieldErrors = save.error instanceof ApiError ? save.error.fieldErrors : {};

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-6" noValidate>
      <Card>
        <CardHeader
          title={isEdit ? t('admin.products.editProduct') : t('admin.products.newProduct')}
          description={t('admin.products.coreDetails')}
        />
        <CardBody className="space-y-4">
          {save.isError && <ErrorBanner error={save.error} />}

          <Field label={t('admin.products.productName')} required error={fieldErrors.name}>
            {(props) => (
              <Input
                {...props}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('misc.examples.productName')}
                required
              />
            )}
          </Field>

          <Field label={t('common.brand')} error={fieldErrors.brand}>
            {(props) => (
              <Input {...props} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder={t('misc.examples.brand')} />
            )}
          </Field>

          <Field label={t('common.description')} error={fieldErrors.description}>
            {(props) => (
              <Textarea
                {...props}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={2000}
                placeholder={t('misc.examples.productDescription')}
              />
            )}
          </Field>

          <Checkbox
            label={t('admin.products.activeHint')}
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
        </CardBody>
      </Card>

      {!isEdit && (
        <>
          <Card>
            <CardHeader
              title={t('common.images')}
              description={t('admin.products.imagesBody')}
            />
            <CardBody>
              <Field label={t('admin.products.imageUrls')} hint={t('admin.products.imageUrlsHint')}>
                {(props) => (
                  <Textarea
                    {...props}
                    rows={3}
                    value={imageUrls}
                    onChange={(e) => setImageUrls(e.target.value)}
                    placeholder={'https://cdn.example.com/oxford-white.jpg\nhttps://cdn.example.com/oxford-detail.jpg'}
                  />
                )}
              </Field>
            </CardBody>
          </Card>

          <VariantMatrixBuilder value={variants} onChange={setVariants} />
        </>
      )}

      <div className="flex gap-3">
        <Button type="submit" loading={save.isPending}>
          {isEdit ? t('common.saveChanges') : t('admin.products.newProduct')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
