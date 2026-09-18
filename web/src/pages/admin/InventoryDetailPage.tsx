import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { InventoryApi } from '@/api/inventory.api';
import { qk } from '@/lib/queryClient';
import { formatDateTime, formatNumber } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
  StatusBadge,
  TableWrap,
  THead,
  TH,
  TBody,
  TR,
  TD,
} from '@/components/ui';
import { AdjustStockDialog } from './inventory/AdjustStockDialog';
import type { InventoryTransactionType } from '@/api/types';
import { useT } from '@/i18n';

/** Inbound movement types render positive and green; everything else is a reduction. */
const INBOUND: InventoryTransactionType[] = ['PURCHASE', 'RETURN', 'ADJUSTMENT_IN'];

export default function InventoryDetailPage() {
  const t = useT();
  const { variantId: variantIdParam } = useParams();
  const variantId = Number(variantIdParam);
  const [page, setPage] = useState(1);
  const [adjusting, setAdjusting] = useState(false);

  const detail = useQuery({
    queryKey: qk.admin.inventoryVariant(variantId),
    queryFn: () => InventoryApi.getByVariant(variantId),
    enabled: Number.isFinite(variantId) && variantId > 0,
  });

  const historyQuery = { variantId, page, limit: 20 };
  const history = useQuery({
    queryKey: qk.admin.transactions(historyQuery),
    queryFn: () => InventoryApi.transactions(historyQuery),
    enabled: Number.isFinite(variantId) && variantId > 0,
    placeholderData: keepPreviousData,
  });

  if (detail.isLoading) return <LoadingState label={t('admin.inventory.loadingVariant')} />;
  if (detail.isError || !detail.data) return <ErrorState error={detail.error} title={t('admin.inventory.variantNotFound')} />;

  const data = detail.data;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/inventory" className="text-sm text-brand-600 hover:underline">
          {t('admin.inventory.backToInventory')}
        </Link>
        <h2 className="mt-2 text-xl font-semibold text-ink-900">{data.product.name}</h2>
        <p className="mt-1 text-sm text-ink-500">
          {data.color} · {data.size} · <span className="font-mono">{data.sku}</span>
          {data.barcode && <> · barcode {data.barcode}</>}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-sm text-ink-500">{t('admin.inventory.currentStock')}</p>
            <p className="mt-1 text-3xl font-semibold text-ink-900">{formatNumber(data.quantity)}</p>
            <div className="mt-2">
              <StatusBadge status={data.status} />
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-sm text-ink-500">{t('admin.inventory.minimumStock')}</p>
            <p className="mt-1 text-3xl font-semibold text-ink-900">{formatNumber(data.minimumStock)}</p>
            <p className="mt-2 text-xs text-ink-500">{t('admin.inventory.lowStockThreshold')}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex h-full flex-col justify-between">
            <div>
              <p className="text-sm text-ink-500">{t('admin.inventory.lastUpdated')}</p>
              <p className="mt-1 text-sm font-medium text-ink-900">{formatDateTime(data.updatedAt)}</p>
            </div>
            <Button className="mt-3" onClick={() => setAdjusting(true)}>
              {t('admin.inventory.adjustStock')}
            </Button>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={t('admin.inventory.historyTitle')}
          description={t('admin.inventory.historyBody')}
        />

        {history.isLoading && <LoadingState label={t('admin.inventory.loadingHistory')} />}
        {history.isError && <ErrorState error={history.error} onRetry={() => void history.refetch()} />}

        {history.isSuccess && history.data.items.length === 0 && (
          <EmptyState title={t('admin.inventory.noMovements')} description={t('admin.inventory.noMovementsBody')} />
        )}

        {history.isSuccess && history.data.items.length > 0 && (
          <>
            <TableWrap>
              <THead>
                <TR>
                  <TH>{t('common.date')}</TH>
                  <TH>{t('admin.audit.action')}</TH>
                  <TH align="right">{t('admin.inventory.change')}</TH>
                  <TH align="right">{t('admin.inventory.previous')}</TH>
                  <TH align="right">{t('admin.inventory.newQty')}</TH>
                  <TH>{t('admin.inventory.reference')}</TH>
                  <TH>{t('common.user')}</TH>
                  <TH>{t('common.note')}</TH>
                </TR>
              </THead>
              <TBody>
                {history.data.items.map((entry) => {
                  const inbound = INBOUND.includes(entry.type);
                  return (
                    <TR key={entry.id}>
                      <TD className="whitespace-nowrap text-xs text-ink-500">{formatDateTime(entry.createdAt)}</TD>
                      <TD>
                        <Badge tone={inbound ? 'success' : entry.type === 'SALE' ? 'brand' : 'neutral'}>
                          {t(`txType.${entry.type}`)}
                        </Badge>
                      </TD>
                      <TD align="right" className="tabular-nums font-semibold">
                        <span className={entry.quantity > 0 ? 'text-success-700' : 'text-danger-700'}>
                          {entry.quantity > 0 ? '+' : ''}
                          {entry.quantity}
                        </span>
                      </TD>
                      <TD align="right" className="tabular-nums text-ink-500">
                        {entry.previousQuantity}
                      </TD>
                      <TD align="right" className="tabular-nums font-medium text-ink-900">
                        {entry.newQuantity}
                      </TD>
                      <TD className="whitespace-nowrap text-xs">
                        {entry.referenceType
                          ? `${t(`refType.${entry.referenceType}`)}${entry.referenceId ? ` #${entry.referenceId}` : ''}`
                          : '—'}
                      </TD>
                      <TD className="text-xs text-ink-600">{entry.user?.name ?? '—'}</TD>
                      <TD className="max-w-48 truncate text-xs text-ink-500" >{entry.note ?? '—'}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </TableWrap>
            <Pagination meta={history.data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>

      <AdjustStockDialog
        open={adjusting}
        onClose={() => setAdjusting(false)}
        variantId={variantId}
        label={`${data.product.name} · ${data.color} · ${data.size}`}
        currentQuantity={data.quantity}
      />
    </div>
  );
}
