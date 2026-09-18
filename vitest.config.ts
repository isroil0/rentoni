import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // Each test file runs in its own process against its own SQLite database file,
    // so suites are fully isolated and can run in parallel.
    pool: 'forks',
    poolOptions: {
      // Every fork boots its own Prisma query engine (a multi-threaded Rust binary).
      // Running one per test file oversubscribes the CPU badly enough that queries can
      // starve past the driver's socket timeout, which shows up as spurious hangs.
      // Capping the pool keeps the suite deterministic and still finishes in ~2s.
      forks: { minForks: 1, maxForks: 4 },
    },
    globalSetup: ['./tests/globalSetup.ts'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    include: ['tests/**/*.test.ts'],
    reporters: ['default'],
  },
});
