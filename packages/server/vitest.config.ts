import { defineConfig } from 'vitest/config';

// app/ is a separate frontend package with its own vitest config (jsdom
// environment) and its own `npm test` -- exclude it here so the root test
// run (Node environment, backend-only) doesn't pick up its browser-only tests.
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', 'app/**'],
    server: {
      deps: {
        // The loader loads module backends with a native import(). Inlined through vite, the CJS bundle
        // `app-core-cli package` writes (dist-module/api-backend/backend.cjs) gets its default export
        // reshaped and would not mirror production.
        external: [/[\/]dist-module[\/]/],
      },
    },
  },
});
