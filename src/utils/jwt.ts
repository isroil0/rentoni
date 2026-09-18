import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';
import type { Role } from '../config/constants';

export interface AccessTokenPayload {
  sub: number;
  role: Role;
  /** Session id — lets logout genuinely invalidate an otherwise-valid JWT. */
  sid: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: `${env.accessTokenTtlMin}m`,
    issuer: 'rentoni-api',
    audience: 'rentoni-client',
  };
  return jwt.sign(payload as unknown as object, env.jwtAccessSecret, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.jwtAccessSecret, {
      issuer: 'rentoni-api',
      audience: 'rentoni-client',
    });
    if (typeof decoded === 'string') throw new Error('unexpected token payload');
    return { sub: Number(decoded.sub), role: decoded.role as Role, sid: String(decoded.sid) };
  } catch {
    throw new AppError('INVALID_TOKEN');
  }
}

/** Opaque refresh token; only its SHA-256 hash is stored. */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(48).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
