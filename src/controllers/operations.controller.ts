import type { Request, Response } from 'express';
import { SupplierService } from '../services/supplier.service';
import { PurchaseService } from '../services/purchase.service';
import { ReturnService } from '../services/return.service';
import { CustomerService } from '../services/customer.service';
import { ReportService } from '../services/report.service';
import { AuditService } from '../services/audit.service';
import { SettingsService } from '../services/settings.service';
import { buildPaginationMeta, created, ok, paginated } from '../utils/response';
import { resolvePage } from '../utils/pagination';
import { getQuery } from '../middleware/validate';
import { actorFrom } from './helpers';
import { toDate } from '../validators/common';

export const SupplierController = {
  async list(req: Request, res: Response) {
    const q = getQuery<{ page: number; limit: number; search?: string; active?: boolean }>(req);
    const page = resolvePage(q);
    const { items, total } = await SupplierService.list({ ...page, search: q.search, active: q.active });
    return paginated(res, items, buildPaginationMeta(page.page, page.limit, total));
  },
  async getById(req: Request, res: Response) {
    return ok(res, await SupplierService.getById(Number(req.params.id)));
  },
  async create(req: Request, res: Response) {
    return created(res, await SupplierService.create(req.body, actorFrom(req)));
  },
  async update(req: Request, res: Response) {
    return ok(res, await SupplierService.update(Number(req.params.id), req.body, actorFrom(req)));
  },
  async remove(req: Request, res: Response) {
    const hard = getQuery<{ hard?: boolean }>(req).hard === true;
    return ok(res, await SupplierService.remove(Number(req.params.id), actorFrom(req), hard));
  },
};

export const PurchaseController = {
  async list(req: Request, res: Response) {
    const q = getQuery<{
      page: number;
      limit: number;
      status?: string;
      supplierId?: number;
      search?: string;
      from?: string;
      to?: string;
    }>(req);
    const page = resolvePage(q);
    const { items, total } = await PurchaseService.list({
      ...page,
      status: q.status,
      supplierId: q.supplierId,
      search: q.search,
      from: toDate(q.from),
      to: toDate(q.to),
    });
    return paginated(res, items, buildPaginationMeta(page.page, page.limit, total));
  },
  async getById(req: Request, res: Response) {
    return ok(res, await PurchaseService.getById(Number(req.params.id)));
  },
  async create(req: Request, res: Response) {
    return created(res, await PurchaseService.create(req.body, actorFrom(req)));
  },
  /** Receiving is atomic and idempotent — a second call returns PURCHASE_ALREADY_RECEIVED. */
  async receive(req: Request, res: Response) {
    return ok(res, await PurchaseService.receive(Number(req.params.id), actorFrom(req)));
  },
  async cancel(req: Request, res: Response) {
    return ok(res, await PurchaseService.cancel(Number(req.params.id), actorFrom(req), req.body?.reason));
  },
};

export const ReturnController = {
  async list(req: Request, res: Response) {
    const q = getQuery<{
      page: number;
      limit: number;
      orderId?: number;
      variantId?: number;
      status?: string;
      customerId?: number;
      from?: string;
      to?: string;
    }>(req);
    const page = resolvePage(q);
    const { items, total } = await ReturnService.list({
      ...page,
      orderId: q.orderId,
      variantId: q.variantId,
      status: q.status,
      customerId: q.customerId,
      from: toDate(q.from),
      to: toDate(q.to),
    });
    return paginated(res, items, buildPaginationMeta(page.page, page.limit, total));
  },
  async getById(req: Request, res: Response) {
    return ok(res, await ReturnService.getById(Number(req.params.id)));
  },
  async eligibility(req: Request, res: Response) {
    return ok(res, await ReturnService.eligibility(Number(req.params.orderId)));
  },
  /** Admin-created returns are accepted (and restock) immediately unless told otherwise. */
  async create(req: Request, res: Response) {
    const rows = await ReturnService.create(
      {
        orderId: req.body.orderId,
        lines: req.body.items,
        reason: req.body.reason,
        autoAccept: req.body.autoAccept ?? true,
      },
      actorFrom(req),
    );
    return created(res, rows);
  },
  async accept(req: Request, res: Response) {
    return ok(res, await ReturnService.accept(Number(req.params.id), actorFrom(req), req.body?.note));
  },
  async reject(req: Request, res: Response) {
    return ok(res, await ReturnService.reject(Number(req.params.id), actorFrom(req), req.body?.reason));
  },
};

export const CustomerAdminController = {
  async list(req: Request, res: Response) {
    const q = getQuery<{ page: number; limit: number; search?: string; active?: boolean }>(req);
    const page = resolvePage(q);
    const { items, total } = await CustomerService.list({ ...page, search: q.search, active: q.active });
    return paginated(res, items, buildPaginationMeta(page.page, page.limit, total));
  },
  async getById(req: Request, res: Response) {
    return ok(res, await CustomerService.getById(Number(req.params.id)));
  },
  async setStatus(req: Request, res: Response) {
    return ok(res, await CustomerService.setStatus(Number(req.params.id), req.body.active, actorFrom(req)));
  },
};

export const ReportController = {
  async dashboard(req: Request, res: Response) {
    return ok(res, await ReportService.dashboardSummary(getQuery(req)));
  },
  async sales(req: Request, res: Response) {
    return ok(res, await ReportService.salesReport(getQuery(req)));
  },
  async inventory(_req: Request, res: Response) {
    return ok(res, await ReportService.inventoryReport());
  },
  async products(req: Request, res: Response) {
    return ok(res, await ReportService.productsReport(getQuery(req)));
  },
  async purchases(req: Request, res: Response) {
    return ok(res, await ReportService.purchasesReport(getQuery(req)));
  },
  async returns(req: Request, res: Response) {
    return ok(res, await ReportService.returnsReport(getQuery(req)));
  },
  async profit(req: Request, res: Response) {
    return ok(res, await ReportService.profitReport(getQuery(req)));
  },
};

export const AuditController = {
  async list(req: Request, res: Response) {
    const q = getQuery<{
      page: number;
      limit: number;
      userId?: number;
      action?: string;
      entityType?: string;
      entityId?: string;
      from?: string;
      to?: string;
    }>(req);
    const page = resolvePage(q);
    const { items, total } = await AuditService.list({
      ...page,
      userId: q.userId,
      action: q.action,
      entityType: q.entityType,
      entityId: q.entityId,
      from: toDate(q.from),
      to: toDate(q.to),
    });
    return paginated(res, items, buildPaginationMeta(page.page, page.limit, total));
  },
};

export const SettingsController = {
  async list(_req: Request, res: Response) {
    return ok(res, await SettingsService.all());
  },
  async update(req: Request, res: Response) {
    const actor = actorFrom(req);
    return ok(res, await SettingsService.setMany(req.body.settings, actor));
  },
};
