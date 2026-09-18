import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { SystemApi } from '@/api/system.api';
import { qk } from '@/lib/queryClient';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDateTime, humanize } from '@/lib/format';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Pagination,
  Select,
  TableWrap,
  THead,
  TH,
  TBody,
  TR,
  TD,
} from '@/components/ui';
import { useT } from '@/i18n';

const ACTIONS = [
  'PRODUCT_CREATED',
  'PRODUCT_UPDATED',
  'PRODUCT_DELETED',
  'VARIANT_CREATED',
  'VARIANT_UPDATED',
  'PRICE_CHANGED',
  'INVENTORY_ADJUSTED',
  'PURCHASE_CREATED',
  'PURCHASE_RECEIVED',
  'PURCHASE_CANCELLED',
  'ORDER_CREATED',
  'ORDER_COMPLETED',
  'ORDER_CANCELLED',
  'ORDER_STATUS_CHANGED',
  'RETURN_CREATED',
  'RETURN_ACCEPTED',
  'RETURN_REJECTED',
  'CUSTOMER_STATUS_CHANGED',
  'SETTING_UPDATED',
];

/** Renders the stored JSON snapshot compactly; unparseable values fall back to raw text. */
function ChangeCell({ value }: { value: string | null }) {
  if (!value) return <span className="text-ink-400">—</span>;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const entries = Object.entries(parsed).slice(0, 4);
    return (
      <span className="block max-w-64 truncate text-xs text-ink-600">
        {entries.map(([key, val]) => `${key}: ${typeof val === 'object' ? JSON.stringify(val) : String(val)}`).join(', ')}
      </span>
    );
  } catch {
    return <span className="block max-w-64 truncate text-xs text-ink-600">{value}</span>;
  }
}

export default function AuditLogsPage() {
  const t = useT();
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const entityId = useDebounce(searchInput, 300);

  const query = {
    page,
    limit: 25,
    action: action || undefined,
    entityType: entityType || undefined,
    entityId: entityId || undefined,
  };

  const logs = useQuery({
    queryKey: qk.admin.auditLogs(query),
    queryFn: () => SystemApi.auditLogs(query),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600">{t('admin.audit.intro')}</p>

      <Card>
        <div className="grid gap-3 border-b border-ink-200 p-4 sm:grid-cols-3">
          <div>
            <label htmlFor="audit-action" className="sr-only">
              {t('admin.audit.filterAction')}
            </label>
            <Select
              id="audit-action"
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('admin.audit.anyAction')}</option>
              {ACTIONS.map((value) => (
                <option key={value} value={value}>
                  {humanize(value)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="audit-entity" className="sr-only">
              {t('admin.audit.filterEntity')}
            </label>
            <Select
              id="audit-entity"
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('admin.audit.anyEntity')}</option>
              {['Product', 'ProductVariant', 'Category', 'Order', 'Purchase', 'Return', 'Supplier', 'User', 'Setting'].map(
                (value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ),
              )}
            </Select>
          </div>
          <div>
            <label htmlFor="audit-entity-id" className="sr-only">
              {t('admin.audit.filterEntityId')}
            </label>
            <Input
              id="audit-entity-id"
              type="search"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(1);
              }}
              placeholder={t('admin.audit.entityId')}
            />
          </div>
        </div>

        {logs.isLoading && <LoadingState label={t('admin.audit.loading')} />}
        {logs.isError && <ErrorState error={logs.error} onRetry={() => void logs.refetch()} />}

        {logs.isSuccess && logs.data.items.length === 0 && (
          <EmptyState title={t('admin.audit.empty')} description={t('admin.audit.emptyBody')} />
        )}

        {logs.isSuccess && logs.data.items.length > 0 && (
          <>
            <TableWrap>
              <THead>
                <TR>
                  <TH>{t('common.date')}</TH>
                  <TH>{t('common.user')}</TH>
                  <TH>{t('admin.audit.action')}</TH>
                  <TH>{t('admin.audit.entity')}</TH>
                  <TH>{t('admin.audit.entityId')}</TH>
                  <TH>{t('admin.audit.before')}</TH>
                  <TH>{t('admin.audit.after')}</TH>
                </TR>
              </THead>
              <TBody>
                {logs.data.items.map((entry) => (
                  <TR key={entry.id}>
                    <TD className="whitespace-nowrap text-xs text-ink-500">{formatDateTime(entry.createdAt)}</TD>
                    <TD className="whitespace-nowrap text-xs">
                      {entry.user ? (
                        <>
                          <span className="font-medium text-ink-900">{entry.user.name}</span>
                          <span className="block text-ink-500">{entry.user.email}</span>
                        </>
                      ) : (
                        <span className="text-ink-400">{t('admin.audit.system')}</span>
                      )}
                    </TD>
                    <TD>
                      <Badge tone={entry.action.includes('DELETED') || entry.action.includes('CANCELLED') ? 'danger' : 'neutral'}>
                        {humanize(entry.action)}
                      </Badge>
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-ink-600">{entry.entityType}</TD>
                    <TD className="font-mono text-xs text-ink-500">{entry.entityId ?? '—'}</TD>
                    <TD>
                      <ChangeCell value={entry.oldValue} />
                    </TD>
                    <TD>
                      <ChangeCell value={entry.newValue} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
            <Pagination meta={logs.data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
