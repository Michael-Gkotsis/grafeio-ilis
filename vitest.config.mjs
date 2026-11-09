import { defineConfig } from 'vitest/config';

// The screen HTML snapshots pin the OS time zone (process.env.TZ). That only works in a child process, not in a worker
// thread, and the Settings clock card and the shell tooltip print the Windows time on purpose
// (see test/support/screens-harness.ts). So these files run in forks; every other test keeps the default pool.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], poolMatchGlobs: [['**/test/screens-*.test.ts', 'forks']] },
});
