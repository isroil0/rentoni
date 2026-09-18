/**
 * Test databases live on a real PostgreSQL server now that the app targets Postgres.
 * Point TEST_DATABASE_URL at any server you can create databases on; the default is
 * the local container documented in README/RAILWAY notes:
 *
 *   docker run -d --name rentoni-pg -e POSTGRES_PASSWORD=dev -p 55432:5432 postgres:16-alpine
 */
export const ADMIN_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:dev@localhost:55432/postgres';

export const TEMPLATE_DB = 'rentoni_test_template';

/** Same server and credentials, different database name. */
export function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}
