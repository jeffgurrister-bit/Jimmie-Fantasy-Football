import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Three suites load the workbook into the SAME throwaway database and one of
    // them truncates it first. Run test files one at a time so they cannot clobber
    // each other's rows — in parallel they interleave and report phantom failures
    // that have nothing to do with the code.
    fileParallelism: false,
    // Loading 24,668 lineup rows into Postgres is not fast.
    testTimeout: 200_000,
    hookTimeout: 200_000,
  },
});
