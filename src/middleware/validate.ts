import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { AppError } from '../errors/AppError';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

function formatIssues(err: ZodError) {
  return err.issues.map((i) => ({
    field: i.path.join('.') || '(root)',
    message: i.message,
    code: i.code,
  }));
}

/**
 * Validates and *replaces* the request parts with the parsed output, so controllers
 * always receive coerced, trimmed, defaulted values rather than raw strings.
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query);
        Object.defineProperty(req, 'validatedQuery', { value: parsed, writable: true, configurable: true });
      }
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(new AppError('VALIDATION_ERROR', formatIssues(err)));
      }
      return next(err);
    }
  };
}

/** Typed accessor for the parsed query (Express 5 makes req.query read-only). */
export function getQuery<T>(req: Request): T {
  return (req as unknown as { validatedQuery?: T }).validatedQuery ?? ({} as T);
}
