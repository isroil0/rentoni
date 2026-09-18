import { Prisma, prisma } from './prisma';
import { AppError } from '../errors/AppError';
import { logger } from '../utils/logger';

/**
 * Errors that mean "the database was busy", not "the request was wrong".
 *
 * Under heavy write concurrency a transaction can fail to acquire the database before
 * its timeout — notably on SQLite, where writers are serialised. The transaction has
 * rolled back cleanly at that point, so retrying the whole closure is safe and is the
 * correct response. Only after several attempts do we surface an error, and then as a
 * retryable 503 rather than a 500.
 */
function isTransient(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2024: pool timeout, P2028: transaction API error, P2034: write conflict/deadlock.
    if (['P2024', 'P2028', 'P2034'].includes(err.code)) return true;
    const message = `${err.message} ${String(err.meta?.message ?? '')}`.toLowerCase();
    return (
      message.includes('socket timeout') ||
      message.includes('database is locked') ||
      message.includes('sqlite_busy') ||
      message.includes('deadlock')
    );
  }
  if (err instanceof Error) {
    const message = err.message.toLowerCase();
    return (
      message.includes('socket timeout') ||
      message.includes('database is locked') ||
      message.includes('transaction already closed')
    );
  }
  return false;
}

const MAX_ATTEMPTS = 6;
const BASE_DELAY_MS = 25;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `fn` in an interactive transaction, retrying only on transient contention.
 * Business errors (INSUFFICIENT_STOCK, validation failures, …) propagate immediately —
 * they are deterministic and must not be retried.
 */
export async function runInTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { maxAttempts?: number; label?: string } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(fn);
    } catch (err) {
      if (err instanceof AppError || !isTransient(err)) throw err;

      lastError = err;
      if (attempt === maxAttempts) break;

      // Exponential backoff with jitter so retrying clients do not sync up.
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1) * (0.5 + Math.random());
      logger.debug(
        `transaction contention${options.label ? ` (${options.label})` : ''}, retry ${attempt}/${maxAttempts - 1} in ${Math.round(delay)}ms`,
      );
      await sleep(delay);
    }
  }

  logger.warn('transaction failed after retries', {
    label: options.label,
    message: lastError instanceof Error ? lastError.message : String(lastError),
  });
  throw new AppError(
    'SERVICE_BUSY',
    'The server is busy processing other requests. Please retry in a moment.',
  );
}
