import type { Request, Response } from 'express';
import { OrderService } from '../services/order.service';
import { buildPaginationMeta, ok, paginated } from '../utils/response';
import { resolvePage } from '../utils/pagination';
import { getQuery } from '../middleware/validate';
import { actorFrom } from './helpers';
import { toDate } from '../validators/common';
import type { OrderSource, OrderStatus } from '../config/constants';

export const OrderController = {
  async list(req: Request, res: Response) {
    const q = getQuery<{
      page: number;
      limit: number;
      status?: OrderStatus;
      source?: OrderSource;
      paymentStatus?: string;
      customerId?: number;
      search?: string;
      from?: string;
      to?: string;
    }>(req);
    const page = resolvePage(q);
    const { items, total } = await OrderService.list({
      ...page,
      status: q.status,
      source: q.source,
      paymentStatus: q.paymentStatus,
      customerId: q.customerId,
      search: q.search,
      from: toDate(q.from),
      to: toDate(q.to),
    });
    return paginated(res, items, buildPaginationMeta(page.page, page.limit, total));
  },

  async getById(req: Request, res: Response) {
    return ok(res, await OrderService.getById(Number(req.params.id)));
  },

  async cancel(req: Request, res: Response) {
    const cancelled = await OrderService.cancel(Number(req.params.id), actorFrom(req), {
      reason: req.body?.reason,
    });
    return ok(res, OrderService.serializeForAdmin(cancelled));
  },

  async updateStatus(req: Request, res: Response) {
    const result = await OrderService.updateStatus(
      Number(req.params.id),
      req.body.status,
      actorFrom(req),
      { paymentMethod: req.body.paymentMethod, reason: req.body.reason },
    );
    return ok(res, result);
  },
};
