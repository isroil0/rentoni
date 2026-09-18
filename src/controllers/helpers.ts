import type { Request } from 'express';
import { requireUser } from '../middleware/auth';
import type { Actor } from '../services/category.service';

/** Who performed the action and from where — threaded into services for audit logging. */
export function actorFrom(req: Request): Actor {
  const user = requireUser(req);
  return { userId: user.id, ip: req.ip ?? null };
}

export function requestContext(req: Request) {
  return { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null };
}
