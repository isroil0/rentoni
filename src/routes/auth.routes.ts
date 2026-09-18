import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';
import {
  bootstrapAdminSchema,
  changePasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
} from '../validators/auth.schema';

const router = Router();

// Credential endpoints get a tighter rate limit than the rest of the API.
router.post('/register', authLimiter, validate({ body: registerSchema }), AuthController.register);
router.post('/login', authLimiter, validate({ body: loginSchema }), AuthController.login);
router.post('/refresh', authLimiter, validate({ body: refreshSchema }), AuthController.refresh);
router.post(
  '/bootstrap-admin',
  authLimiter,
  validate({ body: bootstrapAdminSchema }),
  AuthController.bootstrapAdmin,
);

router.use(authenticate);
router.get('/me', AuthController.me);
router.get('/sessions', AuthController.sessions);
router.post('/logout', AuthController.logout);
router.post('/logout-all', AuthController.logoutAll);
router.post('/change-password', validate({ body: changePasswordSchema }), AuthController.changePassword);

export default router;
