import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { AppError } from '../errors/AppError';
import { verifyAccessToken } from '../utils/jwt';
import type { Role } from '../config/constants';

export interface AuthenticatedUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/**
 * Verifies the JWT, then confirms the referenced session is still live and the user is
 * still active. The session lookup is what makes logout and deactivation take effect
 * immediately rather than at token expiry.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    if (!token) throw new AppError('UNAUTHENTICATED');

    const payload = verifyAccessToken(token);

    const session = await prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      throw new AppError('SESSION_EXPIRED');
    }
    if (session.userId !== payload.sub) throw new AppError('INVALID_TOKEN');
    if (!session.user.active) throw new AppError('ACCOUNT_INACTIVE');

    req.user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role as Role,
      active: session.user.active,
      sessionId: session.id,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/** Attaches req.user when a valid token is present, but never rejects the request. */
export async function optionalAuthenticate(req: Request, res: Response, next: NextFunction) {
  if (!extractToken(req)) return next();
  return authenticate(req, res, (err?: unknown) => (err ? next() : next()));
}

export function requireUser(req: Request): AuthenticatedUser {
  if (!req.user) throw new AppError('UNAUTHENTICATED');
  return req.user;
}
