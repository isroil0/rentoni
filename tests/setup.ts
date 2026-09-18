import crypto from 'node:crypto';
import { afterAll, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ADMIN_URL, TEMPLATE_DB, withDatabase } from './dbUrl';

const dbName = `rentoni_test_${crypto.randomUUID().replace(/-/g, '')}`;

// Set synchronously, before the test file (and therefore src/db/prisma) is imported,
// so the Prisma client is constructed against this database. The client connects
// lazily on first query, which is why the database itself can be created in beforeAll.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = withDatabase(ADMIN_URL, dbName);
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789abcdefghijklmnop';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789abcdefghijklmnop';
process.env.ADMIN_SETUP_TOKEN = 'test-setup-token';

/** Admin connection used only to create and drop this suite's database. */
function adminClient() {
  return new PrismaClient({ datasourceUrl: ADMIN_URL });
}

beforeAll(async () => {
  const admin = adminClient();
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}" TEMPLATE "${TEMPLATE_DB}"`);
  await admin.$disconnect();
});

afterAll(async () => {
  const { prisma } = await import('../src/db/prisma');
  await prisma.$disconnect();

  const admin = adminClient();
  // DROP DATABASE fails while any connection lingers, including pooled ones.
  await admin.$executeRawUnsafe(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid()`,
  );
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}"`);
  await admin.$disconnect();
});
