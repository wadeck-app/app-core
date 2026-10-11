/**
 * Bundles app-core-sdk's library entry and CLI into self-contained ESM files.
 * Inlines every internal @wadeck-app/app-core-server import so the published
 * package has zero runtime dependency on that (never-published) package --
 * only genuine third-party registry packages (zod, fastify, @fastify/static,
 * js-yaml) stay external, listed as real dependencies in package.json.
 * Usage: node scripts/bundle.mjs
 */
import { build } from 'esbuild';
import { rollup } from 'rollup';
import dts from 'rollup-plugin-dts';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

// `dev` needs a standalone copy of the built frontend to serve once this
// package is installed outside the monorepo (packages/frontend-shell/dist
// does not exist in that context) -- see dev.ts. Requires frontend-shell to
// have been built first (root package.json's `build` script order).
function copyFrontendAssets() {
  const frontendDist = path.join(root, '../frontend-shell/dist');
  const targetPublic = path.join(root, 'dist/public');
  if (!fs.existsSync(frontendDist)) {
    throw new Error(
      `packages/frontend-shell/dist not found at ${frontendDist} -- frontend-shell must be built before ` +
        `app-core-sdk (check root package.json's "build" script order).`,
    );
  }
  fs.rmSync(targetPublic, { recursive: true, force: true });
  fs.cpSync(frontendDist, targetPublic, { recursive: true });
  console.log(`Copied frontend-shell/dist -> ${path.relative(root, targetPublic)}`);
}

copyFrontendAssets();

const external = ['zod', 'fastify', '@fastify/static', 'js-yaml'];

await build({
  entryPoints: [path.join(root, 'dist/index.js')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: path.join(root, 'dist/index.bundle.js'),
  external,
  logLevel: 'warning',
});
console.log('Bundled dist/index.bundle.js');

await build({
  entryPoints: [path.join(root, 'dist/cli.js')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: path.join(root, 'dist/cli.bundle.js'),
  external,
  logLevel: 'warning',
});
console.log('Bundled dist/cli.bundle.js');

// tsc's own dist/index.d.ts re-exports by path from '@wadeck-app/app-core-server/...',
// which resolves fine inside the monorepo (a real workspace package) but is a dangling
// reference once published, since app-core-server is never published. A consumer's
// TypeScript then silently widens those types to `any` instead of a clean error (found
// via a real external install, not a guess). rollup-plugin-dts inlines the ACTUAL type
// definitions from app-core-server's own .d.ts output (resolved locally at build time,
// not hand-copied -- Decision #31's no-drift requirement still holds), producing a
// single flattened declaration file with zero external @wadeck-app/app-core-server
// references.
async function bundleTypes() {
  const bundle = await rollup({
    input: path.join(root, 'dist/index.d.ts'),
    plugins: [nodeResolve(), dts()],
  });
  await bundle.write({ file: path.join(root, 'dist/index.bundle.d.ts'), format: 'es' });
  await bundle.close();
  console.log('Bundled dist/index.bundle.d.ts');
}

await bundleTypes();
