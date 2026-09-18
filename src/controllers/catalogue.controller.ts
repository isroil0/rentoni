import type { Request, Response } from 'express';
import { z } from 'zod';
import { ProductService } from '../services/product.service';
import { VariantService } from '../services/variant.service';
import { CategoryService } from '../services/category.service';
import { buildPaginationMeta, created, ok, paginated } from '../utils/response';
import { resolvePage } from '../utils/pagination';
import { getQuery } from '../middleware/validate';
import { actorFrom } from './helpers';
import type { productListQuery, variantListQuery, categoryListQuery } from '../validators/catalogue.schema';

type ProductQuery = z.infer<typeof productListQuery>;
type VariantQuery = z.infer<typeof variantListQuery>;
type CategoryQuery = z.infer<typeof categoryListQuery>;

export const CategoryController = {
  async list(req: Request, res: Response) {
    const q = getQuery<CategoryQuery>(req);
    const page = resolvePage(q);
    const { items, total } = await CategoryService.list({ ...page, search: q.search, active: q.active });
    return paginated(res, items, buildPaginationMeta(page.page, page.limit, total));
  },

  async getById(req: Request, res: Response) {
    return ok(res, await CategoryService.getById(Number(req.params.id)));
  },

  async create(req: Request, res: Response) {
    return created(res, await CategoryService.create(req.body, actorFrom(req)));
  },

  async update(req: Request, res: Response) {
    return ok(res, await CategoryService.update(Number(req.params.id), req.body, actorFrom(req)));
  },

  async remove(req: Request, res: Response) {
    const hard = getQuery<{ hard?: boolean }>(req).hard === true;
    return ok(res, await CategoryService.remove(Number(req.params.id), actorFrom(req), hard));
  },
};

export const ProductController = {
  async list(req: Request, res: Response) {
    const q = getQuery<ProductQuery>(req);
    const page = resolvePage(q);
    const { items, total } = await ProductService.adminList({ ...page, ...q });
    return paginated(res, items, buildPaginationMeta(page.page, page.limit, total));
  },

  async getById(req: Request, res: Response) {
    return ok(res, await ProductService.adminGetById(Number(req.params.id)));
  },

  async create(req: Request, res: Response) {
    return created(res, await ProductService.create(req.body, actorFrom(req)));
  },

  async update(req: Request, res: Response) {
    return ok(res, await ProductService.update(Number(req.params.id), req.body, actorFrom(req)));
  },

  async remove(req: Request, res: Response) {
    const hard = getQuery<{ hard?: boolean }>(req).hard === true;
    return ok(res, await ProductService.remove(Number(req.params.id), actorFrom(req), hard));
  },

  async addImages(req: Request, res: Response) {
    const images = await ProductService.addImages(Number(req.params.id), req.body.images, actorFrom(req));
    return created(res, images);
  },

  async removeImage(req: Request, res: Response) {
    const result = await ProductService.removeImage(
      Number(req.params.id),
      Number(req.params.imageId),
      actorFrom(req),
    );
    return ok(res, result);
  },

  async setPrimaryImage(req: Request, res: Response) {
    const image = await ProductService.setPrimaryImage(Number(req.params.id), Number(req.params.imageId));
    return ok(res, image);
  },

  /** Nested create: POST /admin/products/:id/variants */
  async createVariant(req: Request, res: Response) {
    const variant = await VariantService.create(Number(req.params.id), req.body, actorFrom(req));
    return created(res, variant);
  },
};

export const VariantController = {
  async list(req: Request, res: Response) {
    const q = getQuery<VariantQuery>(req);
    const page = resolvePage(q);
    const { items, total } = await VariantService.list({ ...page, ...q });
    return paginated(res, items, buildPaginationMeta(page.page, page.limit, total));
  },

  async getById(req: Request, res: Response) {
    return ok(res, await VariantService.getById(Number(req.params.id)));
  },

  async lookup(req: Request, res: Response) {
    const { code } = getQuery<{ code: string }>(req);
    return ok(res, await VariantService.findByCode(code));
  },

  async create(req: Request, res: Response) {
    const { productId, ...rest } = req.body;
    return created(res, await VariantService.create(productId, rest, actorFrom(req)));
  },

  async update(req: Request, res: Response) {
    return ok(res, await VariantService.update(Number(req.params.id), req.body, actorFrom(req)));
  },

  async remove(req: Request, res: Response) {
    const hard = getQuery<{ hard?: boolean }>(req).hard === true;
    return ok(res, await VariantService.remove(Number(req.params.id), actorFrom(req), hard));
  },
};

/** Customer-facing catalogue. Cost prices and inventory internals are never serialised. */
export const PublicCatalogueController = {
  async listProducts(req: Request, res: Response) {
    const q = getQuery<ProductQuery>(req);
    const page = resolvePage(q);
    const { items, total } = await ProductService.publicList({ ...page, ...q });
    return paginated(res, items, buildPaginationMeta(page.page, page.limit, total));
  },

  async getProduct(req: Request, res: Response) {
    return ok(res, await ProductService.publicGetById(Number(req.params.id)));
  },

  async listCategories(_req: Request, res: Response) {
    return ok(res, await CategoryService.publicList());
  },
};
