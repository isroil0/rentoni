import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * Frontend tests run against a REAL backend instance.
 *
 * `tests/globalSetup.ts` migrates a throwaway SQLite database, seeds it, and boots the
 * actual Express API on TEST_API_PORT. The API-layer tests then exercise the same
 * client code the app ships with — no mocked endpoints, no fixture responses.
 */
const TEST_API_PORT = 4399;

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Anchor everything to this package: the backend at the repo root also has a
  // vitest config, and without an explicit root Vite resolves paths one level up.
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: [fileURLToPath(new URL('./tests/setup.ts', import.meta.url))],
    globalSetup: [fileURLToPath(new URL('./tests/globalSetup.ts', import.meta.url))],
    include: ['tests/**/*.test.{ts,tsx}'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: 'forks',
    // All test files share one backend instance and one database, and several assert on
    // exact stock levels. Running files in parallel lets them mutate the same variants
    // at once, so the suite is serialised by design rather than made flaky.
    fileParallelism: false,
    poolOptions: { forks: { singleFork: true } },
    env: {
      VITE_API_URL: `http://127.0.0.1:${TEST_API_PORT}/api`,
      TEST_API_PORT: String(TEST_API_PORT),
    },
  },
});
