import { prisma } from '../db/prisma';
import { AppError } from '../errors/AppError';
import { env } from '../config/env';
import { hashPassword, verifyPassword } from '../utils/password';
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  type AccessTokenPayload,
} from '../utils/jwt';
import type { Role } from '../config/constants';
import { AuditService, AUDIT_ACTIONS } from './audit.service';

export interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
}

export interface PublicUser {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Strips the password hash — the only shape a user is ever serialised in. */
export function toPublicUser(user: {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role as Role,
    active: user.active,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function refreshExpiry(): Date {
  return new Date(Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
}

async function issueSession(
  user: { id: number; role: string },
  ctx: RequestContext,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
  const { token, hash } = generateRefreshToken();
  const expiresAt = refreshExpiry();
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: hash,
      expiresAt,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    },
  });
  const payload: AccessTokenPayload = { sub: user.id, role: user.role as Role, sid: session.id };
  return { accessToken: signAccessToken(payload), refreshToken: token, expiresAt };
}

export const AuthService = {
  /**
   * Public self-service registration. The role is hard-coded to CUSTOMER and is never
   * read from the request body, so a client cannot escalate itself to SUPER_ADMIN.
   */
  async register(
    input: { name: string; email: string; phone?: string; password: string },
    ctx: RequestContext,
  ) {
    const email = input.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError('EMAIL_ALREADY_EXISTS');

    const user = await prisma.user.create({
      data: {
        name: input.name.trim(),
        email,
        phone: input.phone?.trim() || null,
        passwordHash: await hashPassword(input.password),
        role: 'CUSTOMER', // never taken from client input
        active: true,
      },
    });

    const tokens = await issueSession(user, ctx);
    return { user: toPublicUser(user), ...tokens };
  },

  async login(input: { email: string; password: string }, ctx: RequestContext) {
    const email = input.email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email } });

    // Constant-ish work regardless of whether the user exists, to avoid user enumeration.
    const passwordOk = user
      ? await verifyPassword(input.password, user.passwordHash)
      : await verifyPassword(input.password, '$2a$04$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi');

    if (!user || !passwordOk) throw new AppError('INVALID_CREDENTIALS');
    if (!user.active) throw new AppError('ACCOUNT_INACTIVE');

    const tokens = await issueSession(user, ctx);
    return { user: toPublicUser(user), ...tokens };
  },

  /** Rotates the refresh token: the presented one is revoked and a fresh session issued. */
  async refresh(refreshToken: string, ctx: RequestContext) {
    const hash = hashRefreshToken(refreshToken);
    const session = await prisma.session.findUnique({ where: { refreshTokenHash: hash }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      throw new AppError('SESSION_EXPIRED');
    }
    if (!session.user.active) throw new AppError('ACCOUNT_INACTIVE');

    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    const tokens = await issueSession(session.user, ctx);
    return { user: toPublicUser(session.user), ...tokens };
  },

  /** Revoking the session makes any still-unexpired access token carrying it useless. */
  async logout(sessionId: string) {
    await prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { loggedOut: true };
  },

  async logoutAll(userId: number) {
    const { count } = await prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { loggedOut: true, sessionsRevoked: count };
  },

  async me(userId: number) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('UNAUTHENTICATED');
    return toPublicUser(user);
  },

  async changePassword(userId: number, input: { currentPassword: string; newPassword: string }) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('UNAUTHENTICATED');
    const okPassword = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!okPassword) throw new AppError('INVALID_CREDENTIALS', 'Current password is incorrect.');

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(input.newPassword) },
    });
    // Force re-authentication everywhere after a credential change.
    await this.logoutAll(userId);
    return { passwordChanged: true };
  },

  /**
   * One-time secure bootstrap of the first SUPER_ADMIN. Requires the out-of-band
   * ADMIN_SETUP_TOKEN and refuses to run once any SUPER_ADMIN exists.
   */
  async bootstrapSuperAdmin(
    input: { name: string; email: string; phone?: string; password: string; setupToken: string },
    ctx: RequestContext,
  ) {
    if (!env.adminSetupToken) {
      throw new AppError('FORBIDDEN', 'Admin bootstrap is disabled (ADMIN_SETUP_TOKEN is not set).');
    }
    if (input.setupToken !== env.adminSetupToken) throw new AppError('FORBIDDEN', 'Invalid setup token.');

    const existing = await prisma.user.count({ where: { role: 'SUPER_ADMIN' } });
    if (existing > 0) throw new AppError('SETUP_ALREADY_COMPLETE');

    const email = input.email.toLowerCase().trim();
    if (await prisma.user.findUnique({ where: { email } })) throw new AppError('EMAIL_ALREADY_EXISTS');

    const user = await prisma.user.create({
      data: {
        name: input.name.trim(),
        email,
        phone: input.phone?.trim() || null,
        passwordHash: await hashPassword(input.password),
        role: 'SUPER_ADMIN',
        active: true,
      },
    });

    await AuditService.record({
      userId: user.id,
      action: AUDIT_ACTIONS.SUPER_ADMIN_BOOTSTRAPPED,
      entityType: 'User',
      entityId: user.id,
      newValue: { email: user.email, role: user.role },
      ip: ctx.ip ?? null,
    });

    return toPublicUser(user);
  },

  async listSessions(userId: number) {
    return prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, ip: true, userAgent: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
  },
};
