import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Phase 1c: wires the real @wadeck-app/dsl-renderer entriesGenerator (the actual
// working precedent is orchestrator/packages/orch-app's vite.config.ts, not
// orch-ui -- orch-ui depends on dsl-renderer/dsl-ui but never calls either).
// entriesGenerator scans dsl-ui's component source (its package.json exports
// raw ./src/*) by default -- no dsl.config.yaml needed, since app-core has no
// custom component package of its own (unlike orch-app's "@orch": "orch-ui").
export default defineConfig(async () => {
  const { entriesGenerator } = await import('@wadeck-app/dsl-renderer/build/entriesGenerator');
  return {
    plugins: [react(), entriesGenerator()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      // Fixed filenames so app-core's static server never serves stale hash mismatches.
      rollupOptions: {
        output: {
          entryFileNames: 'assets/index.js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name].[ext]',
        },
      },
    },
    base: '/',
    server: {
      proxy: {
        '/api': 'http://127.0.0.1:4850',
      },
    },
    optimizeDeps: {
      // Mirrors orch-app's vite.config.ts exactly: dsl-renderer excluded to avoid
      // double-processing its own build plugins; dsl-ui intentionally NOT excluded
      // so Vite pre-bundles it for CJS interop in its transitive deps.
      exclude: ['@wadeck-app/dsl-renderer'],
    },
  };
});
