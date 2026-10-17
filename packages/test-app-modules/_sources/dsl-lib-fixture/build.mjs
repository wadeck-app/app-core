// Builds the dsl-lib fixture bundle:
//   node packages/test-app-modules/_sources/dsl-lib-fixture/build.mjs <outDir> <label>
// The plugin below is the reference for module authors (see packages/app-core-sdk/docs/module-authoring.md):
// it keeps the shell's shared packages out of the bundle and reads them from globalThis.__APP_CORE_SHARED__.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHARED = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'react-router-dom',
  '@wadeck-app/dsl-ui',
  '@wadeck-app/dsl-renderer',
];

export const appCoreShared = {
  name: 'app-core-shared',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /.*/ }, (args) => {
      if (SHARED.includes(args.path)) {
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

const here = dirname(fileURLToPath(import.meta.url));
const [outDirArg, label = 'v1'] = process.argv.slice(2);
if (outDirArg === undefined) {
  console.error('usage: node build.mjs <outDir> [label]');
  process.exit(1);
}
const outDir = resolve(outDirArg);
mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [resolve(here, 'entries.src.mjs')],
  outfile: resolve(outDir, 'entries.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  define: { __FIXTURE_LABEL__: JSON.stringify(label) },
  plugins: [appCoreShared],
  logLevel: 'warning',
});
copyFileSync(resolve(here, 'style.css'), resolve(outDir, 'style.css'));
console.log(`Built dsl-lib fixture (${label}) -> ${outDir}`);
