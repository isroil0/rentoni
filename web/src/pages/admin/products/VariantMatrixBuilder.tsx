import { useState } from 'react';
import type { VariantInput } from '@/api/adminCatalog.api';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  TableWrap,
  THead,
  TH,
  TBody,
  TR,
  TD,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { useT } from '@/i18n';

/**
 * Variants no longer vary by colour, but product_variants.color is NOT NULL with a
 * CHECK that it is non-empty, and rows are unique on (productId, color, size). A
 * single constant satisfies both while keeping exactly one variant per size.
 */
const DEFAULT_COLOR = 'Standard';

const COMMON_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

/**
 * Builds a whole colour × size variant matrix in one pass.
 *
 * Picking "White, Black, Blue" × "S, M, L, XL" generates twelve rows with SKUs derived
 * from a prefix, rather than making the admin fill twelve separate forms. Every
 * generated row stays editable, and rows can be dropped individually.
 */
export function VariantMatrixBuilder({
  value,
  onChange,
}: {
  value: VariantInput[];
  onChange: (variants: VariantInput[]) => void;
}) {
  const t = useT();
  const [sizes, setSizes] = useState<string[]>([]);
  const [defaults, setDefaults] = useState({
    skuPrefix: '',
    costPrice: '',
    sellingPrice: '',
    minimumStock: '5',
    initialStock: '0',
  });

  function toggle(list: string[], setList: (next: string[]) => void, item: string) {
    setList(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  }


  function generate() {
    const prefix = defaults.skuPrefix.trim().toUpperCase() || 'SKU';
    const generated: VariantInput[] = [];

    for (const size of sizes) {
      {
        const sku = `${prefix}-${size.toUpperCase()}`;
        // Never overwrite a row the admin has already edited.
        if (value.some((v) => v.sku === sku)) continue;
        generated.push({
          sku,
          color: DEFAULT_COLOR,
          size,
          costPrice: Number(defaults.costPrice) || 0,
          sellingPrice: Number(defaults.sellingPrice) || 0,
          minimumStock: Number(defaults.minimumStock) || 0,
          initialStock: Number(defaults.initialStock) || 0,
          active: true,
        });
      }
    }

    onChange([...value, ...generated]);
  }

  function updateRow(index: number, patch: Partial<VariantInput>) {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  const canGenerate = sizes.length > 0;

  return (
    <Card>
      <CardHeader
        title={t('admin.variants.title')}
        description={t('admin.variants.matrix.body')}
      />
      <CardBody className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink-700">{t('admin.variants.matrix.sizes')}</legend>
          <div className="flex flex-wrap gap-2">
            {COMMON_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => toggle(sizes, setSizes, size)}
                aria-pressed={sizes.includes(size)}
                className={cn(
                  'min-w-14 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                  sizes.includes(size)
                    ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-ink-300 bg-white text-ink-700 hover:bg-ink-50',
                )}
              >
                {size}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label={t('admin.variants.matrix.skuPrefix')} hint={t('admin.variants.matrix.skuPrefixHint')}>
            {(props) => (
              <Input
                {...props}
                value={defaults.skuPrefix}
                onChange={(e) => setDefaults({ ...defaults, skuPrefix: e.target.value })}
                placeholder="OXF"
              />
            )}
          </Field>
          <Field label={t('admin.variants.costPrice')}>
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                step="0.01"
                value={defaults.costPrice}
                onChange={(e) => setDefaults({ ...defaults, costPrice: e.target.value })}
                className="tabular-nums"
              />
            )}
          </Field>
          <Field label={t('admin.variants.sellingPrice')}>
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                step="0.01"
                value={defaults.sellingPrice}
                onChange={(e) => setDefaults({ ...defaults, sellingPrice: e.target.value })}
                className="tabular-nums"
              />
            )}
          </Field>
          <Field label={t('admin.variants.minimumStock')}>
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                value={defaults.minimumStock}
                onChange={(e) => setDefaults({ ...defaults, minimumStock: e.target.value })}
                className="tabular-nums"
              />
            )}
          </Field>
          <Field label={t('admin.variants.openingStock')} hint={t('admin.variants.openingStockHint')}>
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                value={defaults.initialStock}
                onChange={(e) => setDefaults({ ...defaults, initialStock: e.target.value })}
                className="tabular-nums"
              />
            )}
          </Field>
        </div>

        <Button type="button" variant="secondary" onClick={generate} disabled={!canGenerate}>
          {canGenerate
            ? t('admin.variants.matrix.generateCount', { count: sizes.length })
            : t('admin.variants.matrix.generate')}
        </Button>

        {value.length === 0 ? (
          <EmptyState
            title={t('admin.variants.matrix.emptyTitle')}
            description={t('admin.variants.matrix.emptyBody')}
          />
        ) : (
          <div>
            <p className="mb-2 text-sm text-ink-600">
              {t('admin.variants.matrix.ready', { count: t('common.variantCount', { count: value.length }) })}
            </p>
            <TableWrap className="rounded-md border border-ink-200">
              <THead>
                <TR>
                  <TH>{t('common.sku')}</TH>
                  <TH>{t('common.colour')}</TH>
                  <TH>{t('common.size')}</TH>
                  <TH align="right">{t('common.cost')}</TH>
                  <TH align="right">{t('common.price')}</TH>
                  <TH align="right">{t('admin.variants.min')}</TH>
                  <TH align="right">{t('admin.products.stock')}</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {value.map((variant, index) => (
                  <TR key={`${variant.sku}-${index}`}>
                    <TD>
                      <Input
                        value={variant.sku}
                        onChange={(e) => updateRow(index, { sku: e.target.value })}
                        aria-label={t('admin.variants.matrix.skuFor', { size: variant.size })}
                        className="h-8 w-32 font-mono text-xs"
                      />
                    </TD>
                    <TD>{variant.color}</TD>
                    <TD>{variant.size}</TD>
                    <TD align="right">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={variant.costPrice}
                        onChange={(e) => updateRow(index, { costPrice: Number(e.target.value) })}
                        aria-label={t('admin.variants.matrix.costFor', { sku: variant.sku })}
                        className="h-8 w-20 text-right tabular-nums"
                      />
                    </TD>
                    <TD align="right">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={variant.sellingPrice}
                        onChange={(e) => updateRow(index, { sellingPrice: Number(e.target.value) })}
                        aria-label={t('admin.variants.matrix.priceFor', { sku: variant.sku })}
                        className="h-8 w-20 text-right tabular-nums"
                      />
                    </TD>
                    <TD align="right">
                      <Input
                        type="number"
                        min={0}
                        value={variant.minimumStock ?? 0}
                        onChange={(e) => updateRow(index, { minimumStock: Number(e.target.value) })}
                        aria-label={t('admin.variants.matrix.minFor', { sku: variant.sku })}
                        className="h-8 w-16 text-right tabular-nums"
                      />
                    </TD>
                    <TD align="right">
                      <Input
                        type="number"
                        min={0}
                        value={variant.initialStock ?? 0}
                        onChange={(e) => updateRow(index, { initialStock: Number(e.target.value) })}
                        aria-label={t('admin.variants.matrix.openingFor', { sku: variant.sku })}
                        className="h-8 w-16 text-right tabular-nums"
                      />
                    </TD>
                    <TD align="right">
                      <button
                        type="button"
                        onClick={() => onChange(value.filter((_, i) => i !== index))}
                        className="text-sm text-danger-600 hover:underline"
                        aria-label={t('admin.variants.matrix.removeVariant', { sku: variant.sku })}
                      >
                        {t('common.remove')}
                      </button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
