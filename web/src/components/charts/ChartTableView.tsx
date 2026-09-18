import { TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui';
import { useT } from '@/i18n';

/**
 * Every chart ships a table view, so no value is reachable only by hovering.
 * Collapsed by default to keep the dashboard calm.
 */
export function ChartTableView<T>({
  rows,
  columns,
  caption,
}: {
  rows: T[];
  columns: {
    key: string;
    label: string;
    align?: 'left' | 'right';
    /** Formats the cell; required unless the raw field is already display-ready. */
    format: (row: T) => string;
  }[];
  caption?: string;
}) {
  const t = useT();
  if (rows.length === 0) return null;

  return (
    <details className="mt-3 border-t border-ink-100 pt-3">
      <summary className="cursor-pointer text-sm text-ink-500 hover:text-ink-800">
        {caption ?? t('common.viewAsTable')}
      </summary>
      <div className="mt-3">
        <TableWrap className="rounded-md border border-ink-200">
          <THead>
            <TR>
              {columns.map((column) => (
                <TH key={column.key} align={column.align ?? 'left'}>
                  {column.label}
                </TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {rows.map((row, index) => (
              <TR key={index}>
                {columns.map((column) => (
                  <TD
                    key={column.key}
                    align={column.align ?? 'left'}
                    className={column.align === 'right' ? 'tabular-nums' : undefined}
                  >
                    {column.format(row)}
                  </TD>
                ))}
              </TR>
            ))}
          </TBody>
        </TableWrap>
      </div>
    </details>
  );
}
