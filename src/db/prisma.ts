import { PrismaClient, Prisma } from '@prisma/client';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Anything that can execute queries: the root client or an interactive transaction
 * client. Services accept this so the same code runs inside and outside a transaction.
 */
export type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * SQLite serialises writers onto a single connection, so a queued transaction must be
 * willing to wait rather than give up after Prisma's 5s default. These parameters are
 * ignored by other providers, where the pool settings come from the URL itself.
 */
function tuneDatasourceUrl(url: string): string {
  if (!url.startsWith('file:')) return url;
  const [base, query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  if (!params.has('connection_limit')) params.set('connection_limit', '1');
  if (!params.has('socket_timeout')) params.set('socket_timeout', '30');
  return `${base}?${params.toString()}`;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: tuneDatasourceUrl(env.databaseUrl),
    log: env.isProd ? ['warn', 'error'] : env.isTest ? ['error'] : ['warn', 'error'],
    transactionOptions: {
      // Generous enough that a writer queued behind others still gets its turn.
      maxWait: 20_000,
      timeout: 25_000,
    },
  });

if (!env.isProd) globalForPrisma.prisma = prisma;

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect().catch((e) => logger.error('prisma disconnect failed', e));
}

export { Prisma };
