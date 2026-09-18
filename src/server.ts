import { createApp } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { disconnectPrisma, prisma } from './db/prisma';

async function main() {
  // Fail fast if the database is unreachable rather than serving 500s.
  await prisma.$queryRaw`SELECT 1`;

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(`API listening on http://localhost:${env.port}${env.apiPrefix} (${env.nodeEnv})`);
    logger.info(`API documentation at http://localhost:${env.port}/docs`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectPrisma();
      process.exit(0);
    });
    // Do not hang forever if connections refuse to drain.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch(async (err) => {
  logger.error('Failed to start server', err);
  await disconnectPrisma();
  process.exit(1);
});
