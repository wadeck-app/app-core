import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**'],
    // Subprocess and real-server tests run in parallel files; the 5 s default timed out under that load.
    testTimeout: 30_000,
    server: {
      deps: {
        // The server loads module backends with a native import(); inlined through vite, a CJS bundle's
        // default export is reshaped and the packaged-module end-to-end test would not mirror production.
        external: [/[\/]packages[\/]server[\/]dist[\/]/],
      },
    },
  },
});
