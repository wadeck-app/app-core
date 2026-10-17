/**
 * Bundles app-core-cli's CLI entry and its separate background-updater entry
 * into self-contained files, and copies the built frontend for `dev` to serve
 * standalone (see dev.ts). Inlines @wadeck-app/app-core-server so the
 * published package has zero runtime dependency on that unpublished package.
 * Usage: node scripts/bundle.mjs
 */
import { build } from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeBuildInfo } from '../../../scripts/build-info.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function copyFrontendAssets() {
  const frontendDist = path.join(root, '../frontend-shell/dist');
  const targetPublic = path.join(root, 'dist/public');
  if (!fs.existsSync(frontendDist)) {
    throw new Error(
      `packages/frontend-shell/dist not found at ${frontendDist} -- frontend-shell must be built before ` +
        `app-core-cli (check root package.json's "build" script order).`,
    );
  }
  fs.rmSync(targetPublic, { recursive: true, force: true });
  fs.cpSync(frontendDist, targetPublic, { recursive: true });
  console.log(`Copied frontend-shell/dist -> ${path.relative(root, targetPublic)}`);
  const buildInfo = writeBuildInfo(targetPublic, path.join(root, '../..'));
  console.log(`Wrote dist/public/build-info.json ${JSON.stringify(buildInfo)}`);
}

copyFrontendAssets();

const external = ['zod', 'fastify', '@fastify/static', 'js-yaml', 'semver', '@wadeck-app/shared-cli', '@wadeck-app/shared-updater'];
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')).version;
const define = { __APP_CORE_CLI_VERSION__: JSON.stringify(version) };

await build({
  entryPoints: [path.join(root, 'dist/cli.js')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: path.join(root, 'dist/cli.bundle.js'),
  external,
  define,
  logLevel: 'warning',
});
console.log('Bundled dist/cli.bundle.js');

// Bundled SEPARATELY and as CJS (not ESM) -- the updater must not share a
// module graph with the main CLI runtime, and shared-updater's own strategy
// implementation expects a standalone script. Filename must be
// app-core-cli-updater.cjs (the <binary-name>-updater.cjs convention every
// other @wadeck-app CLI in this workspace uses -- queue-updater.cjs,
// orchestrator-updater.cjs, flow-updater.cjs) since cli.ts looks for that
// exact name.
await build({
  entryPoints: [path.join(root, 'dist/updater-entry.js')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: path.join(root, 'dist/app-core-cli-updater.cjs'),
  external: ['@wadeck-app/shared-cli', '@wadeck-app/shared-updater'],
  define,
  logLevel: 'warning',
});
console.log('Bundled dist/app-core-cli-updater.cjs');

// Same safeguard every other @wadeck-app CLI's updater bundle has: catches
// the CLI runtime accidentally getting pulled into the updater bundle.
const MAX_UPDATER_SIZE = 500 * 1024;
const updaterSize = fs.statSync(path.join(root, 'dist/app-core-cli-updater.cjs')).size;
if (updaterSize > MAX_UPDATER_SIZE) {
  throw new Error(
    `app-core-cli-updater.cjs is ${updaterSize} bytes (${(updaterSize / 1024).toFixed(1)} KB) -- exceeds 500 KB limit. ` +
      'The CLI runtime may have been accidentally included -- check updater-entry.ts imports.',
  );
}

// Zero internal cross-package references in published output, same invariant
// as app-core-sdk's own bundle script. dist/** is excluded from violations
// scanning by design, so this is asserted here at build time instead.
function assertNoInternalReferences() {
  const packagesDir = path.join(root, '..');
  const siblingNames = fs
    .readdirSync(packagesDir)
    .filter((dir) => dir !== 'app-core-cli')
    .map((dir) => {
      const pkgPath = path.join(packagesDir, dir, 'package.json');
      if (!fs.existsSync(pkgPath)) return null;
      return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).name;
    })
    .filter(Boolean)
    .filter((name) => name !== '@wadeck-app/app-core-sdk'); // real published dependency, not internal-only

  const publishedFiles = ['dist/cli.bundle.js', 'dist/app-core-cli-updater.cjs'].map((f) => path.join(root, f));

  for (const file of publishedFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    for (const name of siblingNames) {
      if (content.includes(name)) {
        throw new Error(`${path.relative(root, file)} contains a reference to "${name}" -- fix the bundling step, do not ship this.`);
      }
    }
  }
  console.log('Verified: zero internal cross-package references in published output.');
}

assertNoInternalReferences();
