import { ERROR_CODES, type ErrorCode } from './codes';

/**
 * The only error type services are expected to throw. The error handler converts it
 * into the standard `{ success: false, error: { code, message, details } }` envelope.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly expose = true;

  constructor(code: ErrorCode, messageOrDetails?: string | unknown, details?: unknown) {
    const spec = ERROR_CODES[code];
    const message = typeof messageOrDetails === 'string' ? messageOrDetails : spec.message;
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = spec.status;
    this.details = typeof messageOrDetails === 'string' ? details : messageOrDetails;
    Error.captureStackTrace?.(this, AppError);
  }

  static notFound(code: ErrorCode = 'NOT_FOUND', message?: string) {
    return new AppError(code, message);
  }
}

export const isAppError = (err: unknown): err is AppError => err instanceof AppError;
