import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { ADMIN_URL, TEMPLATE_DB, withDatabase } from './dbUrl';

/**
 * Builds one migrated template database up front. Each test file then creates its own
 * database from it with CREATE DATABASE ... TEMPLATE, which is far faster than running
 * migrations per suite — the Postgres equivalent of copying the old SQLite file.
 */
export default async function setup() {
  const admin = new PrismaClient({ datasourceUrl: ADMIN_URL });

  // A template cannot be cloned while anything is connected to it, and a leftover from
  // a killed run would otherwise block the whole suite.
  await dropDatabases(admin, TEMPLATE_DB);
  await admin.$executeRawUnsafe(`CREATE DATABASE "${TEMPLATE_DB}"`);

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: withDatabase(ADMIN_URL, TEMPLATE_DB) },
    stdio: 'pipe',
  });

  await admin.$disconnect();

  return async () => {
    const cleanup = new PrismaClient({ datasourceUrl: ADMIN_URL });
    const rows = await cleanup.$queryRawUnsafe<{ datname: string }[]>(
      `SELECT datname FROM pg_database WHERE datname LIKE 'rentoni_test%'`,
    );
    for (const { datname } of rows) await dropDatabases(cleanup, datname);
    await cleanup.$disconnect();
  };
}

/** Terminates stray connections first, otherwise DROP DATABASE fails. */
async function dropDatabases(client: PrismaClient, name: string) {
  await client.$executeRawUnsafe(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}' AND pid <> pg_backend_pid()`,
  );
  await client.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`);
}
