import { defineConfig } from 'vitest/config';

// Dedicated config for running .violations/ rule tests from the repo root --
// packages/server/vitest.config.ts only covers that package's own tests.
export default defineConfig({
  test: {
    include: ['.violations/**/*.test.ts'],
  },
});
