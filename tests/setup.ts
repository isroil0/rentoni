import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { afterAll } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const TMP = path.join(ROOT, '.tmp');
const TEMPLATE_DB = path.join(TMP, 'test-template.db');

// Runs before the test file (and therefore before src/db/prisma) is imported, so the
// Prisma client picks up this database URL.
const dbFile = path.join(TMP, `test-${crypto.randomUUID()}.db`);
fs.copyFileSync(TEMPLATE_DB, dbFile);

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `file:${dbFile}`;
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789abcdefghijklmnop';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789abcdefghijklmnop';
process.env.ADMIN_SETUP_TOKEN = 'test-setup-token';

afterAll(async () => {
  const { prisma } = await import('../src/db/prisma');
  await prisma.$disconnect();
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    fs.rmSync(`${dbFile}${suffix}`, { force: true });
  }
});
