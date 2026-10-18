import type { Plugin } from 'esbuild';

// Packages the shell provides as singletons to module bundles (read from globalThis.__APP_CORE_SHARED__).
// Keep in sync with the shell's registration (packages/frontend-shell) and SHARED_PACKAGES in the server's dslLib.ts.
export const SHARED_SPECIFIERS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'react-router-dom',
  '@wadeck-app/dsl-ui',
  '@wadeck-app/dsl-renderer',
];

// Keeps the shell's shared packages out of a module's dsl-lib bundle, so the module and the shell
// use the same React, router and dsl-ui instances (contexts, hooks and toasts work across both).
export const appCoreShared: Plugin = {
  name: 'app-core-shared',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /.*/ }, (args) => {
      if (SHARED_SPECIFIERS.includes(args.path)) {
        return { path: args.path, namespace: 'app-core-shared' };
      }
      // Deep imports such as '@wadeck-app/dsl-ui/dist/components/display/Badge.js' (what entriesGenerator
      // emits) resolve to the shared dsl-ui root, so contexts (toast, router...) are the shell's own.
      if (args.path.startsWith('@wadeck-app/dsl-ui/dist/')) {
        return { path: '@wadeck-app/dsl-ui', namespace: 'app-core-shared' };
      }
      return undefined;
    });
    pluginBuild.onLoad({ filter: /.*/, namespace: 'app-core-shared' }, (args) => ({
      contents: `module.exports = globalThis.__APP_CORE_SHARED__[${JSON.stringify(args.path)}];`,
      loader: 'js',
    }));
  },
};
