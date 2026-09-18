import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { writeLimiter } from '../middleware/rateLimit';
import { idParams, positiveInt } from '../validators/common';

import {
  CategoryController,
  ProductController,
  VariantController,
} from '../controllers/catalogue.controller';
import { InventoryController } from '../controllers/inventory.controller';
import { PosController } from '../controllers/pos.controller';
import { OrderController } from '../controllers/order.controller';
import {
  AuditController,
  CustomerAdminController,
  PurchaseController,
  ReportController,
  ReturnController,
  SettingsController,
  SupplierController,
} from '../controllers/operations.controller';

import {
  categoryCreateSchema,
  categoryListQuery,
  categoryUpdateSchema,
  deleteQuery,
  imagesCreateSchema,
  productCreateSchema,
  productImageParams,
  productListQuery,
  productUpdateSchema,
  variantCreateSchema,
  variantListQuery,
  variantUpdateSchema,
} from '../validators/catalogue.schema';
import {
  inventoryAdjustSchema,
  inventoryListQuery,
  inventoryTransactionsQuery,
  lowStockQuery,
} from '../validators/inventory.schema';
import {
  cancelSchema,
  orderListQuery,
  orderStatusSchema,
  posCompleteSchema,
  posOrderCreateSchema,
  posQuoteSchema,
  posSearchQuery,
} from '../validators/order.schema';
import {
  auditListQuery,
  customerListQuery,
  customerStatusSchema,
  purchaseCreateSchema,
  purchaseListQuery,
  reportQuery,
  returnCreateSchema,
  returnDecisionSchema,
  returnListQuery,
  settingsUpdateSchema,
  supplierCreateSchema,
  supplierListQuery,
  supplierUpdateSchema,
} from '../validators/operations.schema';

/**
 * Every route in this file is gated by `authenticate` + `requireSuperAdmin`.
 * This is the entire back office: catalogue, inventory, POS, purchasing, orders,
 * returns, customers, reports, settings and the audit trail.
 */
const router = Router();
router.use(authenticate, requireSuperAdmin);

// ---- categories -----------------------------------------------------------
router.get('/categories', validate({ query: categoryListQuery }), CategoryController.list);
router.post('/categories', validate({ body: categoryCreateSchema }), CategoryController.create);
router.get('/categories/:id', validate({ params: idParams }), CategoryController.getById);
router.put(
  '/categories/:id',
  validate({ params: idParams, body: categoryUpdateSchema }),
  CategoryController.update,
);
router.delete(
  '/categories/:id',
  validate({ params: idParams, query: deleteQuery }),
  CategoryController.remove,
);

// ---- products -------------------------------------------------------------
router.get('/products', validate({ query: productListQuery }), ProductController.list);
router.post('/products', validate({ body: productCreateSchema }), ProductController.create);
router.get('/products/:id', validate({ params: idParams }), ProductController.getById);
router.put('/products/:id', validate({ params: idParams, body: productUpdateSchema }), ProductController.update);
router.delete('/products/:id', validate({ params: idParams, query: deleteQuery }), ProductController.remove);

router.post(
  '/products/:id/images',
  validate({ params: idParams, body: imagesCreateSchema }),
  ProductController.addImages,
);
router.delete(
  '/products/:id/images/:imageId',
  validate({ params: productImageParams }),
  ProductController.removeImage,
);
router.post(
  '/products/:id/images/:imageId/primary',
  validate({ params: productImageParams }),
  ProductController.setPrimaryImage,
);
router.post(
  '/products/:id/variants',
  validate({ params: idParams, body: variantCreateSchema }),
  ProductController.createVariant,
);

// ---- variants -------------------------------------------------------------
router.get('/variants', validate({ query: variantListQuery }), VariantController.list);
router.get(
  '/variants/lookup',
  validate({ query: z.object({ code: z.string().trim().min(1).max(64) }).strict() }),
  VariantController.lookup,
);
router.post(
  '/variants',
  validate({ body: variantCreateSchema.extend({ productId: positiveInt }) }),
  VariantController.create,
);
router.get('/variants/:id', validate({ params: idParams }), VariantController.getById);
router.put('/variants/:id', validate({ params: idParams, body: variantUpdateSchema }), VariantController.update);
router.delete('/variants/:id', validate({ params: idParams, query: deleteQuery }), VariantController.remove);

// ---- inventory ------------------------------------------------------------
router.get('/inventory', validate({ query: inventoryListQuery }), InventoryController.list);
router.get('/inventory/low-stock', validate({ query: lowStockQuery }), InventoryController.lowStock);
router.get('/inventory/out-of-stock', validate({ query: lowStockQuery }), InventoryController.outOfStock);
router.get(
  '/inventory/transactions',
  validate({ query: inventoryTransactionsQuery }),
  InventoryController.transactions,
);
router.post(
  '/inventory/adjust',
  writeLimiter,
  validate({ body: inventoryAdjustSchema }),
  InventoryController.adjust,
);
router.get(
  '/inventory/:variantId',
  validate({ params: z.object({ variantId: positiveInt }) }),
  InventoryController.getByVariant,
);

// ---- POS ------------------------------------------------------------------
router.get('/pos/search', validate({ query: posSearchQuery }), PosController.search);
router.post('/pos/quote', validate({ body: posQuoteSchema }), PosController.quote);
router.post('/pos/orders', writeLimiter, validate({ body: posOrderCreateSchema }), PosController.createOrder);
router.post(
  '/pos/orders/:id/complete',
  writeLimiter,
  validate({ params: idParams, body: posCompleteSchema }),
  PosController.complete,
);
router.post(
  '/pos/orders/:id/cancel',
  validate({ params: idParams, body: cancelSchema }),
  PosController.cancel,
);
router.get('/pos/orders/:id/receipt', validate({ params: idParams }), PosController.receipt);

// ---- orders ---------------------------------------------------------------
router.get('/orders', validate({ query: orderListQuery }), OrderController.list);
router.get('/orders/:id', validate({ params: idParams }), OrderController.getById);
router.post('/orders/:id/cancel', validate({ params: idParams, body: cancelSchema }), OrderController.cancel);
router.post(
  '/orders/:id/status',
  validate({ params: idParams, body: orderStatusSchema }),
  OrderController.updateStatus,
);

// ---- suppliers ------------------------------------------------------------
router.get('/suppliers', validate({ query: supplierListQuery }), SupplierController.list);
router.post('/suppliers', validate({ body: supplierCreateSchema }), SupplierController.create);
router.get('/suppliers/:id', validate({ params: idParams }), SupplierController.getById);
router.put(
  '/suppliers/:id',
  validate({ params: idParams, body: supplierUpdateSchema }),
  SupplierController.update,
);
router.delete(
  '/suppliers/:id',
  validate({ params: idParams, query: deleteQuery }),
  SupplierController.remove,
);

// ---- purchases ------------------------------------------------------------
router.get('/purchases', validate({ query: purchaseListQuery }), PurchaseController.list);
router.post('/purchases', writeLimiter, validate({ body: purchaseCreateSchema }), PurchaseController.create);
router.get('/purchases/:id', validate({ params: idParams }), PurchaseController.getById);
router.post('/purchases/:id/receive', writeLimiter, validate({ params: idParams }), PurchaseController.receive);
router.post(
  '/purchases/:id/cancel',
  validate({ params: idParams, body: cancelSchema }),
  PurchaseController.cancel,
);

// ---- returns --------------------------------------------------------------
router.get('/returns', validate({ query: returnListQuery }), ReturnController.list);
router.post('/returns', writeLimiter, validate({ body: returnCreateSchema }), ReturnController.create);
router.get(
  '/returns/eligibility/:orderId',
  validate({ params: z.object({ orderId: positiveInt }) }),
  ReturnController.eligibility,
);
router.get('/returns/:id', validate({ params: idParams }), ReturnController.getById);
router.post(
  '/returns/:id/accept',
  validate({ params: idParams, body: returnDecisionSchema }),
  ReturnController.accept,
);
router.post(
  '/returns/:id/reject',
  validate({ params: idParams, body: returnDecisionSchema }),
  ReturnController.reject,
);

// ---- customers ------------------------------------------------------------
router.get('/customers', validate({ query: customerListQuery }), CustomerAdminController.list);
router.get('/customers/:id', validate({ params: idParams }), CustomerAdminController.getById);
router.patch(
  '/customers/:id/status',
  validate({ params: idParams, body: customerStatusSchema }),
  CustomerAdminController.setStatus,
);

// ---- dashboard & reports --------------------------------------------------
router.get('/dashboard/summary', validate({ query: reportQuery }), ReportController.dashboard);
router.get('/reports/sales', validate({ query: reportQuery }), ReportController.sales);
router.get('/reports/inventory', ReportController.inventory);
router.get('/reports/products', validate({ query: reportQuery }), ReportController.products);
router.get('/reports/purchases', validate({ query: reportQuery }), ReportController.purchases);
router.get('/reports/returns', validate({ query: reportQuery }), ReportController.returns);
router.get('/reports/profit', validate({ query: reportQuery }), ReportController.profit);

// ---- settings & audit -----------------------------------------------------
router.get('/settings', SettingsController.list);
router.put('/settings', validate({ body: settingsUpdateSchema }), SettingsController.update);
router.get('/audit-logs', validate({ query: auditListQuery }), AuditController.list);

export default router;
