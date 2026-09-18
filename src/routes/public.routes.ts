import { Router } from 'express';
import { PublicCatalogueController } from '../controllers/catalogue.controller';
import { validate } from '../middleware/validate';
import { productListQuery } from '../validators/catalogue.schema';
import { idParams } from '../validators/common';

/**
 * Unauthenticated storefront endpoints. These are served by the customer-safe
 * serializers, so cost price, supplier data and inventory transactions are absent.
 */
const router = Router();

router.get('/products', validate({ query: productListQuery }), PublicCatalogueController.listProducts);
router.get('/products/:id', validate({ params: idParams }), PublicCatalogueController.getProduct);
router.get('/categories', PublicCatalogueController.listCategories);

export default router;
