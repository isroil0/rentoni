import type { Request, Response } from 'express';
import { InventoryService } from '../services/inventory.service';
import { buildPaginationMeta, ok, paginated } from '../utils/response';
import { resolvePage } from '../utils/pagination';
import { getQuery } from '../middleware/validate';
import { actorFrom } from './helpers';
import { toDate } from '../validators/common';

export const InventoryController = {
  async list(req: Request, res: Response) {
    const q = getQuery<Record<string, never>>(req) as never as {
      page: number;
      limit: number;
      search?: string;
      categoryId?: number;
      productId?: number;
      status?: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
      active?: boolean;
    };
    const page = resolvePage(q);
    const { items, total } = await InventoryService.list({ ...page, ...q });
    return paginated(res, items, buildPaginationMeta(page.page, page.limit, total));
  },

  async getByVariant(req: Request, res: Response) {
    return ok(res, await InventoryService.getByVariant(Number(req.params.variantId)));
  },

  async lowStock(req: Request, res: Response) {
    const q = getQuery<{ page: number; limit: number; includeOutOfStock?: boolean }>(req);
    const page = resolvePage(q);
    const { items, total } = await InventoryService.lowStock({ ...page, includeOutOfStock: q.includeOutOfStock });
    return paginated(res, items, buildPaginationMeta(page.page, page.limit, total));
  },

  async outOfStock(req: Request, res: Response) {
    const page = resolvePage(getQuery<{ page: number; limit: number }>(req));
    const { items, total } = await InventoryService.outOfStock(page);
    return paginated(res, items, buildPaginationMeta(page.page, page.limit, total));
  },

  /** The only write endpoint for stock outside purchases, orders and returns. */
  async adjust(req: Request, res: Response) {
    const actor = actorFrom(req);
    const result = await InventoryService.adjust({
      variantId: req.body.variantId,
      type: req.body.type ?? 'ADJUSTMENT_IN',
      quantity: req.body.quantity,
      setQuantity: req.body.setQuantity,
      note: req.body.note ?? null,
      userId: actor.userId,
      ip: actor.ip,
    });
    return ok(res, result);
  },

  async transactions(req: Request, res: Response) {
    const q = getQuery<{
      page: number;
      limit: number;
      variantId?: number;
      type?: never;
      referenceType?: never;
      referenceId?: number;
      userId?: number;
      from?: string;
      to?: string;
    }>(req);
    const page = resolvePage(q);
    const { items, total } = await InventoryService.listTransactions({
      ...page,
      variantId: q.variantId,
      type: q.type,
      referenceType: q.referenceType,
      referenceId: q.referenceId,
      userId: q.userId,
      from: toDate(q.from),
      to: toDate(q.to),
    });
    return paginated(res, items, buildPaginationMeta(page.page, page.limit, total));
  },
};
