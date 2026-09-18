import { Router } from 'express';
import { CustomerSelfController } from '../controllers/customerSelf.controller';
import { authenticate } from '../middleware/auth';
import { requireCustomer } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { writeLimiter } from '../middleware/rateLimit';
import { idParams, positiveInt } from '../validators/common';
import { z } from 'zod';
import {
  cancelSchema,
  cartAddSchema,
  cartItemParams,
  cartUpdateSchema,
  customerOrderCreateSchema,
  customerOrderListQuery,
} from '../validators/order.schema';
import { profileUpdateSchema, returnCreateSchema, returnListQuery } from '../validators/operations.schema';

/**
 * All routes below require an authenticated CUSTOMER. SUPER_ADMIN is intentionally
 * excluded: the admin has its own richer endpoints under /admin.
 */
const router = Router();
router.use(authenticate, requireCustomer);

router.get('/profile', CustomerSelfController.getProfile);
router.put('/profile', validate({ body: profileUpdateSchema }), CustomerSelfController.updateProfile);

router.get('/cart', CustomerSelfController.getCart);
router.post('/cart/items', validate({ body: cartAddSchema }), CustomerSelfController.addToCart);
router.patch(
  '/cart/items/:variantId',
  validate({ params: cartItemParams, body: cartUpdateSchema }),
  CustomerSelfController.updateCartItem,
);
router.delete(
  '/cart/items/:variantId',
  validate({ params: cartItemParams }),
  CustomerSelfController.removeCartItem,
);
router.delete('/cart', CustomerSelfController.clearCart);

router.post(
  '/orders',
  writeLimiter,
  validate({ body: customerOrderCreateSchema }),
  CustomerSelfController.createOrder,
);
router.get('/orders', validate({ query: customerOrderListQuery }), CustomerSelfController.listOrders);
router.get('/orders/:id', validate({ params: idParams }), CustomerSelfController.getOrder);
router.post(
  '/orders/:id/cancel',
  validate({ params: idParams, body: cancelSchema }),
  CustomerSelfController.cancelOrder,
);
router.get(
  '/orders/:orderId/return-eligibility',
  validate({ params: z.object({ orderId: positiveInt }) }),
  CustomerSelfController.returnEligibility,
);

router.post(
  '/returns',
  writeLimiter,
  validate({ body: returnCreateSchema.omit({ autoAccept: true }) }),
  CustomerSelfController.createReturn,
);
router.get('/returns', validate({ query: returnListQuery.pick({ page: true, limit: true, status: true }) }), CustomerSelfController.listReturns);
router.get('/returns/:id', validate({ params: idParams }), CustomerSelfController.getReturn);

export default router;
