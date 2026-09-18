import type { ApiMeta } from '@/lib/apiClient';
import { Button } from './Button';
import { useT } from '@/i18n';

/**
 * Server-driven pagination. The UI only ever asks for the page it shows, so a list of
 * thousands of inventory rows is never fetched to display twenty.
 */
export function Pagination({
  meta,
  onPageChange,
  className,
}: {
  meta: ApiMeta;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  const t = useT();
  if (meta.total === 0) return null;

  const first = (meta.page - 1) * meta.limit + 1;
  const last = Math.min(meta.page * meta.limit, meta.total);

  return (
    <nav
      className={`flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 px-4 py-3 ${className ?? ''}`}
      aria-label={t('common.pagination.label')}
    >
      <p className="text-sm text-ink-500">
        {t('common.pagination.showing', { first, last, total: meta.total })}
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={!meta.hasPrev} onClick={() => onPageChange(meta.page - 1)}>
          {t('common.pagination.previous')}
        </Button>
        <span className="px-1 text-sm text-ink-600" aria-current="page">
          {t('common.pagination.page', { page: meta.page, pages: Math.max(meta.totalPages, 1) })}
        </span>
        <Button size="sm" variant="secondary" disabled={!meta.hasNext} onClick={() => onPageChange(meta.page + 1)}>
          {t('common.pagination.next')}
        </Button>
      </div>
    </nav>
  );
}
