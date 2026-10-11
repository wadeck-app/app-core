/**
 * Bundles app-core-sdk's library entry and CLI into self-contained ESM files.
 * Inlines every internal @wadeck-app/app-core-server import so the published
 * package has zero runtime dependency on that (never-published) package --
 * only genuine third-party registry packages (zod, fastify, @fastify/static,
 * js-yaml) stay external, listed as real dependencies in package.json.
 * Usage: node scripts/bundle.mjs
 */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

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
