import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const TMP = path.join(BACKEND_ROOT, '.tmp');
const PORT = Number(process.env.TEST_API_PORT ?? 4399);

let server: ChildProcess | null = null;
let dbFile = '';

async function waitForHealth(url: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Backend did not become healthy at ${url}`);
}

/**
 * Boots the real API against a fresh, seeded database so the frontend is verified
 * against actual backend behaviour — including its authorization and stock rules.
 */
export default async function setup() {
  fs.mkdirSync(TMP, { recursive: true });
  dbFile = path.join(TMP, `web-test-${crypto.randomUUID()}.db`);

  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: `file:${dbFile}`,
    PORT: String(PORT),
    JWT_ACCESS_SECRET: 'web-test-access-secret-0123456789abcdefghij',
    JWT_REFRESH_SECRET: 'web-test-refresh-secret-0123456789abcdefghij',
    ADMIN_SETUP_TOKEN: 'web-test-setup-token',
    CORS_ORIGINS: '*',
  };

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: BACKEND_ROOT, env, stdio: 'pipe' });
  execFileSync('npx', ['tsx', 'prisma/seed.ts'], { cwd: BACKEND_ROOT, env, stdio: 'pipe' });

  server = spawn('npx', ['tsx', 'src/server.ts'], { cwd: BACKEND_ROOT, env, stdio: 'pipe' });
  server.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    if (text.includes('Error') || text.includes('error')) process.stderr.write(`[api] ${text}`);
  });

  await waitForHealth(`http://127.0.0.1:${PORT}/api/health`);

  return () => {
    server?.kill('SIGTERM');
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      fs.rmSync(`${dbFile}${suffix}`, { force: true });
    }
  };
}
