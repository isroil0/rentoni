import type { Request, Response } from 'express';
import { PosService } from '../services/pos.service';
import { created, ok } from '../utils/response';
import { getQuery } from '../middleware/validate';
import { actorFrom } from './helpers';

/** POS endpoints — mounted behind requireSuperAdmin. */
export const PosController = {
  async search(req: Request, res: Response) {
    const { q, limit } = getQuery<{ q: string; limit?: number }>(req);
    return ok(res, await PosService.search({ query: q, limit }));
  },

  /** Dry-run pricing for the on-screen cart; writes nothing. */
  async quote(req: Request, res: Response) {
    return ok(res, await PosService.quote({ ...req.body, lines: req.body.items }));
  },

  async createOrder(req: Request, res: Response) {
    const { items, ...rest } = req.body;
    return created(res, await PosService.createOrder({ ...rest, lines: items }, actorFrom(req)));
  },

  async complete(req: Request, res: Response) {
    return ok(res, await PosService.complete(Number(req.params.id), req.body, actorFrom(req)));
  },

  async cancel(req: Request, res: Response) {
    return ok(res, await PosService.cancel(Number(req.params.id), req.body, actorFrom(req)));
  },

  async receipt(req: Request, res: Response) {
    return ok(res, await PosService.receipt(Number(req.params.id)));
  },
};
