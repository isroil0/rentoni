import type { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { created, ok } from '../utils/response';
import { requireUser } from '../middleware/auth';
import { requestContext } from './helpers';

export const AuthController = {
  /** Public registration. Always creates a CUSTOMER — role is never read from the body. */
  async register(req: Request, res: Response) {
    const result = await AuthService.register(req.body, requestContext(req));
    return created(res, result);
  },

  async login(req: Request, res: Response) {
    const result = await AuthService.login(req.body, requestContext(req));
    return ok(res, result);
  },

  async refresh(req: Request, res: Response) {
    const result = await AuthService.refresh(req.body.refreshToken, requestContext(req));
    return ok(res, result);
  },

  async logout(req: Request, res: Response) {
    const user = requireUser(req);
    return ok(res, await AuthService.logout(user.sessionId));
  },

  async logoutAll(req: Request, res: Response) {
    const user = requireUser(req);
    return ok(res, await AuthService.logoutAll(user.id));
  },

  async me(req: Request, res: Response) {
    const user = requireUser(req);
    return ok(res, await AuthService.me(user.id));
  },

  async sessions(req: Request, res: Response) {
    const user = requireUser(req);
    return ok(res, await AuthService.listSessions(user.id));
  },

  async changePassword(req: Request, res: Response) {
    const user = requireUser(req);
    return ok(res, await AuthService.changePassword(user.id, req.body));
  },

  /** One-time bootstrap of the first SUPER_ADMIN, gated by ADMIN_SETUP_TOKEN. */
  async bootstrapAdmin(req: Request, res: Response) {
    const result = await AuthService.bootstrapSuperAdmin(req.body, requestContext(req));
    return created(res, result);
  },
};
