import type { Request, Response } from 'express';
import { CustomerService } from '../services/customer.service';
import { CartService, CustomerOrderService } from '../services/customerOrder.service';
import { ReturnService } from '../services/return.service';
import { buildPaginationMeta, created, ok, paginated } from '../utils/response';
import { resolvePage } from '../utils/pagination';
import { getQuery } from '../middleware/validate';
import { requireUser } from '../middleware/auth';

/**
 * Everything a signed-in CUSTOMER can do. Every handler derives the customer id from
 * the authenticated session — never from the request body or a path parameter — so a
 * customer structurally cannot address another customer's data.
 */
export const CustomerSelfController = {
  async getProfile(req: Request, res: Response) {
    return ok(res, await CustomerService.getProfile(requireUser(req).id));
  },

  async updateProfile(req: Request, res: Response) {
    return ok(res, await CustomerService.updateProfile(requireUser(req).id, req.body));
  },

  async createOrder(req: Request, res: Response) {
    const user = requireUser(req);
    const order = await CustomerOrderService.create(
      user.id,
      {
        lines: req.body.items,
        fromCart: req.body.fromCart,
        paymentMethod: req.body.paymentMethod,
        note: req.body.note,
        shippingPhone: req.body.shippingPhone,
      },
      { ip: req.ip ?? null },
    );
    return created(res, order);
  },

  async listOrders(req: Request, res: Response) {
    const user = requireUser(req);
    const q = getQuery<{ page: number; limit: number; status?: string }>(req);
    const page = resolvePage(q);
    const { items, total } = await CustomerOrderService.listOwn(user.id, { ...page, status: q.status });
    return paginated(res, items, buildPaginationMeta(page.page, page.limit, total));
  },

  async getOrder(req: Request, res: Response) {
    const user = requireUser(req);
    return ok(res, await CustomerOrderService.getOwn(user.id, Number(req.params.id)));
  },

  async cancelOrder(req: Request, res: Response) {
    const user = requireUser(req);
    const order = await CustomerOrderService.cancelOwn(
      user.id,
      Number(req.params.id),
      req.body?.reason,
      req.ip ?? null,
    );
    return ok(res, order);
  },

  /** Customer returns are created as REQUESTED; an admin must accept them to restock. */
  async createReturn(req: Request, res: Response) {
    const user = requireUser(req);
    const rows = await ReturnService.create(
      {
        orderId: req.body.orderId,
        lines: req.body.items,
        reason: req.body.reason,
        autoAccept: false,
        customerId: user.id,
      },
      { userId: user.id, ip: req.ip ?? null },
    );
    return created(res, rows);
  },

  async listReturns(req: Request, res: Response) {
    const user = requireUser(req);
    const q = getQuery<{ page: number; limit: number; status?: string }>(req);
    const page = resolvePage(q);
    const { items, total } = await ReturnService.listOwn(user.id, { ...page, status: q.status });
    return paginated(res, items, buildPaginationMeta(page.page, page.limit, total));
  },

  async getReturn(req: Request, res: Response) {
    const user = requireUser(req);
    return ok(res, await ReturnService.getById(Number(req.params.id), { customerId: user.id }));
  },

  async returnEligibility(req: Request, res: Response) {
    const user = requireUser(req);
    return ok(res, await ReturnService.eligibility(Number(req.params.orderId), { customerId: user.id }));
  },

  // ---- cart ---------------------------------------------------------------

  async getCart(req: Request, res: Response) {
    return ok(res, await CartService.get(requireUser(req).id));
  },

  async addToCart(req: Request, res: Response) {
    return created(res, await CartService.addItem(requireUser(req).id, req.body));
  },

  async updateCartItem(req: Request, res: Response) {
    const user = requireUser(req);
    const result = await CartService.setItemQuantity(
      user.id,
      Number(req.params.variantId),
      req.body.quantity,
    );
    return ok(res, result);
  },

  async removeCartItem(req: Request, res: Response) {
    const user = requireUser(req);
    return ok(res, await CartService.removeItem(user.id, Number(req.params.variantId)));
  },

  async clearCart(req: Request, res: Response) {
    return ok(res, await CartService.clear(requireUser(req).id));
  },
};
