import rateLimit, { type Options } from 'express-rate-limit';
import { env } from '../config/env';

const shared: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later.' },
  },
  // Rate limiting would make the test suite flaky and slow; disabled under NODE_ENV=test.
  skip: () => env.isTest,
};

export const globalLimiter = rateLimit({
  ...shared,
  windowMs: env.rateLimitWindowMin * 60 * 1000,
  limit: env.rateLimitMax,
});

/** Tighter budget on credential endpoints to blunt brute-force attempts. */
export const authLimiter = rateLimit({
  ...shared,
  windowMs: env.rateLimitWindowMin * 60 * 1000,
  limit: env.authRateLimitMax,
});

/** Writes that consume stock are rate limited more tightly than plain reads. */
export const writeLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 1000,
  limit: 120,
});
