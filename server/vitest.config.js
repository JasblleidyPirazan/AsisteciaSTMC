import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // Route/guard tests overwrite the shared Prisma singleton's methods, so run
    // each test file in its own worker to avoid cross-file interference.
    fileParallelism: true,
    isolate: true,
  },
});
