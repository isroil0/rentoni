import path from 'node:path';
import fs from 'node:fs';
import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import YAML from 'yaml';
import swaggerUi from 'swagger-ui-express';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { globalLimiter } from './middleware/rateLimit';
import { env } from './config/env';
import { logger } from './utils/logger';

/** Raised when a browser origin is not on the allowlist. Mapped to 403, never 500. */
export class CorsNotAllowedError extends Error {
  constructor(readonly origin: string) {
    super(`Origin ${origin} is not allowed by CORS`);
    this.name = 'CorsNotAllowedError';
  }
}

/**
 * Private (RFC 1918) and loopback origins — a phone or laptop on the same LAN hitting
 * the dev server by its local IP.
 *
 * These are accepted ONLY outside production, so `npm run dev -- --host` works on a
 * real device without hand-editing CORS_ORIGINS every time DHCP hands out a new
 * address. In production the explicit allowlist is the only thing that grants access.
 */
const PRIVATE_ORIGIN =
  /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

export function isOriginAllowed(origin: string, allowlist: readonly string[], isProd: boolean): boolean {
  if (allowlist.includes('*') || allowlist.includes(origin)) return true;
  return !isProd && PRIVATE_ORIGIN.test(origin);
}

export function createApp(): Express {
  const app = express();

  // Behind a reverse proxy req.ip must come from X-Forwarded-For for rate limiting to work.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // Swagger UI needs inline styles/scripts; the API itself serves no HTML.
      contentSecurityPolicy: false,
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Allow non-browser clients (curl, mobile apps, server-to-server) with no Origin.
        if (!origin) return callback(null, true);
        if (isOriginAllowed(origin, env.corsOrigins, env.isProd)) return callback(null, true);
        return callback(new CorsNotAllowedError(origin));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(globalLimiter);

  if (!env.isTest) {
    app.use((req, res, next) => {
      const started = Date.now();
      res.on('finish', () => {
        logger.debug(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
      });
      next();
    });
  }

  // ---- OpenAPI docs -------------------------------------------------------
  const specPath = path.resolve(__dirname, '../docs/openapi.yaml');
  if (fs.existsSync(specPath)) {
    const spec = YAML.parse(fs.readFileSync(specPath, 'utf8'));
    app.get('/openapi.json', (_req, res) => res.json(spec));
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'Rentoni API' }));
  }

  app.get('/', (_req, res) => {
    res.json({
      success: true,
      data: {
        name: "Rentoni — Men's Shirt POS + Inventory API",
        version: '1.0.0',
        docs: '/docs',
        api: env.apiPrefix,
      },
    });
  });

  app.use(env.apiPrefix, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
