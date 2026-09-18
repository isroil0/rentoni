import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '..');
const TMP = path.join(ROOT, '.tmp');
export const TEMPLATE_DB = path.join(TMP, 'test-template.db');

/**
 * Builds one migrated SQLite database up front. Each test file then copies this
 * template, which is far faster than running migrations per suite.
 */
export default function setup() {
  fs.mkdirSync(TMP, { recursive: true });
  fs.rmSync(TEMPLATE_DB, { force: true });

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: `file:${TEMPLATE_DB}` },
    stdio: 'pipe',
  });

  return () => {
    // Remove every per-suite database created during the run.
    for (const file of fs.readdirSync(TMP)) {
      if (file.startsWith('test-')) fs.rmSync(path.join(TMP, file), { force: true });
    }
  };
}
