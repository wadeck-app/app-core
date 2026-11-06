import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { entriesGeneratorUrl, restartOnDslUpdate } from './viteRestartOnDslUpdate';

// Phase 1c: wires the real @wadeck-app/dsl-renderer entriesGenerator (the actual
// working precedent is orchestrator/packages/orch-app's vite.config.ts, not
// orch-ui -- orch-ui depends on dsl-renderer/dsl-ui but never calls either).
// entriesGenerator scans dsl-ui's component source (its package.json exports
// raw ./src/*) by default -- no dsl.config.yaml needed, since app-core has no
// custom component package of its own (unlike orch-app's "@orch": "orch-ui").
export default defineConfig(async () => {
  // Imported by a URL that carries the installed version: Vite's own restart (see restartOnDslUpdate) keeps modules already imported,
  // so a plain import would keep generating the registry with the generator of the dsl the process started with.
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const { entriesGenerator } = (await import(/* @vite-ignore */ entriesGeneratorUrl(root))) as typeof import('@wadeck-app/dsl-renderer/build/entriesGenerator');
  // Where the dev server proxies the API: the app-core started on 4850 by default; APP_CORE_API points it at another one
  // (for example an isolated server with sample modules).
  const api = process.env['APP_CORE_API'] ?? 'http://127.0.0.1:4850';
  return {
    // The root package-lock.json is where `npm install` of a new dsl ends: see restartOnDslUpdate.
    plugins: [react(), entriesGenerator(), restartOnDslUpdate({ root, lockfile: fileURLToPath(new URL('../../package-lock.json', import.meta.url)) })],
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
        '/api': api,
        // Written by the build next to the served frontend (versions shown in the shell's versions menu).
        '/build-info.json': api,
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
