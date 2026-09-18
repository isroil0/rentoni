import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import type { Role } from '../config/constants';

/**
 * Centralised role gate. There are exactly two roles in this system:
 * SUPER_ADMIN (full back-office access) and CUSTOMER (own data only).
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('UNAUTHENTICATED'));
    if (!roles.includes(req.user.role)) return next(new AppError('FORBIDDEN'));
    return next();
  };
}

export const requireSuperAdmin = requireRole('SUPER_ADMIN');
export const requireCustomer = requireRole('CUSTOMER');

/**
 * Ownership check for customer-scoped resources. SUPER_ADMIN bypasses it; a CUSTOMER
 * may only ever act on rows whose owner id matches their own.
 */
export function assertOwnership(req: Request, ownerId: number | null | undefined) {
  if (!req.user) throw new AppError('UNAUTHENTICATED');
  if (req.user.role === 'SUPER_ADMIN') return;
  if (ownerId == null || ownerId !== req.user.id) throw new AppError('FORBIDDEN');
}
