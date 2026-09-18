import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '../db/prisma';
import { AppError } from '../errors/AppError';
import { ERROR_CODES, type ErrorCode } from '../errors/codes';
import { env } from '../config/env';
import { logger } from '../utils/logger';

interface ErrorBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

/** Maps Prisma unique-constraint targets onto meaningful domain error codes. */
function mapUniqueViolation(target: string[] | string | undefined): ErrorCode {
  const fields = Array.isArray(target) ? target.join(',') : String(target ?? '');
  if (fields.includes('sku')) return 'DUPLICATE_SKU';
  if (fields.includes('barcode')) return 'DUPLICATE_BARCODE';
  if (fields.includes('color') || fields.includes('size')) return 'DUPLICATE_VARIANT';
  if (fields.includes('email')) return 'EMAIL_ALREADY_EXISTS';
  if (fields.includes('name')) return 'CATEGORY_NAME_EXISTS';
  return 'CONFLICT';
}

function translate(err: unknown): { status: number; body: ErrorBody; internal?: unknown } {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: {
        success: false,
        error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
      },
    };
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const code = mapUniqueViolation((err.meta as { target?: string[] })?.target);
      return {
        status: ERROR_CODES[code].status,
        body: { success: false, error: { code, message: ERROR_CODES[code].message } },
      };
    }
    if (err.code === 'P2025') {
      return {
        status: 404,
        body: { success: false, error: { code: 'NOT_FOUND', message: ERROR_CODES.NOT_FOUND.message } },
      };
    }
    if (err.code === 'P2003') {
      return {
        status: 409,
        body: {
          success: false,
          error: { code: 'CONFLICT', message: 'Related records prevent this operation.' },
        },
      };
    }
    // CHECK constraint violations surface as P2010 raw-query failures — the last line
    // of defence (e.g. inventory.quantity >= 0) should never be reached in practice.
    if (err.code === 'P2010' && String(err.meta?.message ?? '').includes('CHECK constraint')) {
      return {
        status: 409,
        body: {
          success: false,
          error: { code: 'CONFLICT', message: 'Operation violates a database integrity constraint.' },
        },
        internal: err,
      };
    }
  }

  // A request from a non-allowlisted browser origin is the caller's problem.
  if (err instanceof Error && err.name === 'CorsNotAllowedError') {
    return {
      status: 403,
      body: {
        success: false,
        error: { code: 'FORBIDDEN', message: 'This origin is not allowed to call the API.' },
      },
    };
  }

  if (err instanceof SyntaxError && 'body' in err) {
    return {
      status: 400,
      body: { success: false, error: { code: 'BAD_REQUEST', message: 'Malformed JSON body.' } },
    };
  }

  return {
    status: 500,
    body: { success: false, error: { code: 'INTERNAL_ERROR', message: ERROR_CODES.INTERNAL_ERROR.message } },
    internal: err,
  };
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const { status, body, internal } = translate(err);

  if (status >= 500 || internal) {
    logger.error(`${req.method} ${req.originalUrl} -> ${status}`, {
      message: err instanceof Error ? err.message : String(err),
      stack: !env.isProd && err instanceof Error ? err.stack : undefined,
    });
  }

  // Stack traces are never returned to clients in production.
  if (!env.isProd && status >= 500 && err instanceof Error) {
    body.error.details = { message: err.message };
  }

  res.status(status).json(body);
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} does not exist.` },
  });
}
