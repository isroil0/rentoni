import { Router } from 'express';
import authRoutes from './auth.routes';
import publicRoutes from './public.routes';
import customerRoutes from './customer.routes';
import adminRoutes from './admin.routes';
import { prisma } from '../db/prisma';

const router = Router();

router.get('/health', async (_req, res) => {
  // A trivial query proves the database connection is alive, not just the process.
  await prisma.$queryRaw`SELECT 1`;
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

router.use('/auth', authRoutes);
router.use('/', publicRoutes);       // GET /products, /products/:id, /categories
router.use('/customer', customerRoutes);
router.use('/admin', adminRoutes);

export default router;
