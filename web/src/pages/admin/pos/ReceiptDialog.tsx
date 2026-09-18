import { useQuery } from '@tanstack/react-query';
import { PosApi } from '@/api/pos.api';
import { formatDateTime, formatMoney } from '@/lib/format';
import { Button, LoadingState, Modal } from '@/components/ui';
import type { AdminOrder } from '@/api/types';
import { useT } from '@/i18n';

/**
 * Post-sale confirmation and printable receipt.
 *
 * The receipt payload comes from the backend so the printed document always matches
 * what was actually recorded against the order.
 */
export function ReceiptDialog({ order, onClose }: { order: AdminOrder | null; onClose: () => void }) {
  const t = useT();
  const receipt = useQuery({
    queryKey: ['pos', 'receipt', order?.id],
    queryFn: () => PosApi.receipt(order!.id),
    enabled: Boolean(order?.id),
  });

  return (
    <Modal
      open={Boolean(order)}
      onClose={onClose}
      title={t('admin.pos.receipt.title')}
      description={order ? `${order.orderNumber} · ${formatMoney(order.total)}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('admin.pos.receipt.newSale')}
          </Button>
          <Button onClick={() => window.print()} disabled={!receipt.data}>
            {t('admin.pos.receipt.print')}
          </Button>
        </>
      }
    >
      {receipt.isLoading && <LoadingState label={t('admin.pos.receipt.preparing')} />}

      {receipt.data && (
        <div id="receipt" className="mx-auto max-w-sm font-mono text-xs text-ink-800">
          <div className="text-center">
            <p className="text-sm font-semibold tracking-wide">RENTONI SHIRTS</p>
            <p className="mt-1">{formatDateTime(receipt.data.date)}</p>
            <p className="mt-0.5">Receipt {receipt.data.orderNumber}</p>
            {receipt.data.cashier && (
              <p className="mt-0.5">{t('admin.pos.receipt.servedBy', { name: receipt.data.cashier })}</p>
            )}
            <p className="mt-0.5">{t('admin.pos.receipt.customer', { name: receipt.data.customer })}</p>
          </div>

          <div className="my-3 border-t border-dashed border-ink-300" />

          <table className="w-full">
            <caption className="sr-only">{t('admin.pos.receipt.itemsCaption', { number: receipt.data.orderNumber })}</caption>
            <thead>
              <tr className="text-left">
                <th className="pb-1 font-normal">{t('admin.pos.receipt.item')}</th>
                <th className="pb-1 text-right font-normal">{t('admin.pos.receipt.qty')}</th>
                <th className="pb-1 text-right font-normal">{t('common.total')}</th>
              </tr>
            </thead>
            <tbody>
              {receipt.data.items.map((item) => (
                <tr key={item.sku}>
                  <td className="py-0.5 pr-2 align-top">
                    {item.name}
                    <br />
                    <span className="text-ink-500">
                      {item.color}/{item.size} @ {formatMoney(item.unitPrice)}
                    </span>
                  </td>
                  <td className="py-0.5 text-right align-top tabular-nums">{item.quantity}</td>
                  <td className="py-0.5 text-right align-top tabular-nums">{formatMoney(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="my-3 border-t border-dashed border-ink-300" />

          <dl className="space-y-1">
            <div className="flex justify-between">
              <dt>{t('common.subtotal')}</dt>
              <dd className="tabular-nums">{formatMoney(receipt.data.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{t('common.discount')}</dt>
              <dd className="tabular-nums">−{formatMoney(receipt.data.discount)}</dd>
            </div>
            <div className="flex justify-between text-sm font-semibold">
              <dt>{t('common.total').toUpperCase()}</dt>
              <dd className="tabular-nums">{formatMoney(receipt.data.total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{t('common.payment')}</dt>
              <dd>{receipt.data.paymentMethod ?? '—'}</dd>
            </div>
          </dl>

          <p className="mt-4 text-center">{t('admin.pos.receipt.thanks')}</p>
        </div>
      )}
    </Modal>
  );
}
