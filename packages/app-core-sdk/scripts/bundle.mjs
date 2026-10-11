/**
 * Bundles app-core-sdk's types/schemas entry into a self-contained ESM file +
 * flattened .d.ts. Inlines every internal @wadeck-app/app-core-server import so
 * the published package has zero runtime dependency on that (never-published)
 * package -- only genuine third-party registry packages (zod, fastify) stay
 * external, listed as real dependencies in package.json.
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
const external = ['zod', 'fastify'];

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

// tsc's own dist/index.d.ts re-exports by path from '@wadeck-app/app-core-server/...',
// which resolves fine inside the monorepo (a real workspace package) but is a dangling
// reference once published, since app-core-server is never published. rollup-plugin-dts
// inlines the ACTUAL type definitions from app-core-server's own .d.ts output (resolved
// locally at build time, not hand-copied -- Decision #31's no-drift requirement still
// holds), producing a single flattened declaration file with zero external
// @wadeck-app/app-core-server references.
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

// app-core-sdk is the "base" package every app-module depends on -- it must have
// ZERO internal cross-package references in what actually gets published, runtime
// or type-only. The package.json "dependencies" field is covered by a violations
// rule (app-core-sdk/no-internal-dependencies), but that rule can't see this
// package's *built output* -- dist/** is globally excluded from violations
// scanning by design (lints source, not build artifacts). So the dist-output half
// of this invariant is asserted here instead, right after the files that matter
// are produced, failing the build (and therefore CI's publish job) loudly instead
// of silently shipping a dangling reference like the two bugs this replaces.
function assertNoInternalReferences() {
  const packagesDir = path.join(root, '..');
  const siblingNames = fs
    .readdirSync(packagesDir)
    .filter((dir) => dir !== 'app-core-sdk')
    .map((dir) => {
      const pkgPath = path.join(packagesDir, dir, 'package.json');
      if (!fs.existsSync(pkgPath)) return null;
      return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).name;
    })
    .filter(Boolean);

  const publishedFiles = ['dist/index.bundle.js', 'dist/index.bundle.d.ts'].map((f) => path.join(root, f));

  for (const file of publishedFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    for (const name of siblingNames) {
      if (content.includes(name)) {
        throw new Error(
          `${path.relative(root, file)} contains a reference to "${name}" -- app-core-sdk's published ` +
            `output must have zero internal cross-package references (runtime or type-only). This is ` +
            `exactly the class of bug that caused the original dangling @wadeck-app/app-core-server ` +
            `.d.ts reference -- fix the bundling step, do not ship this.`,
        );
      }
    }
  }
  console.log('Verified: zero internal cross-package references in published output.');
}

assertNoInternalReferences();
