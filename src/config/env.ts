import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true } as never);

function str(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function int(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) throw new Error(`Environment variable ${key} must be an integer`);
  return parsed;
}

const nodeEnv = str('NODE_ENV', 'development');
const isProd = nodeEnv === 'production';

function secret(key: string, devFallback: string): string {
  const value = process.env[key];
  if (!value) {
    if (isProd) throw new Error(`Missing required secret in production: ${key}`);
    return devFallback;
  }
  if (isProd && value.length < 32) {
    throw new Error(`${key} must be at least 32 characters in production`);
  }
  return value;
}

export const env = {
  nodeEnv,
  isProd,
  isTest: nodeEnv === 'test',
  port: int('PORT', 4000),
  apiPrefix: str('API_PREFIX', '/api'),

  databaseUrl: str('DATABASE_URL', 'file:./dev.db'),

  jwtAccessSecret: secret('JWT_ACCESS_SECRET', 'dev-access-secret-change-me-0123456789abcdef'),
  jwtRefreshSecret: secret('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me-0123456789abcdef'),
  accessTokenTtlMin: int('ACCESS_TOKEN_TTL_MIN', 30),
  refreshTokenTtlDays: int('REFRESH_TOKEN_TTL_DAYS', 7),
  // Cheap hashing under test keeps the suite fast; production uses a real work factor.
  bcryptRounds: nodeEnv === 'test' ? 4 : int('BCRYPT_ROUNDS', 10),

  // localhost and 127.0.0.1 are distinct browser origins, so both are allowed by
  // default — otherwise a dev browsing via 127.0.0.1 has every write rejected.
  corsOrigins: str(
    'CORS_ORIGINS',
    'http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173',
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  rateLimitWindowMin: int('RATE_LIMIT_WINDOW_MIN', 15),
  rateLimitMax: int('RATE_LIMIT_MAX', 600),
  authRateLimitMax: int('AUTH_RATE_LIMIT_MAX', 20),

  superAdminEmail: str('SUPER_ADMIN_EMAIL', 'admin@rentoni.test'),
  superAdminPassword: str('SUPER_ADMIN_PASSWORD', 'Admin@12345'),
  superAdminName: str('SUPER_ADMIN_NAME', 'Store Owner'),
  adminSetupToken: process.env.ADMIN_SETUP_TOKEN ?? '',
} as const;
