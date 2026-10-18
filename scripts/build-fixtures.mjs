// Builds every fixture module of packages/test-app-modules into its own dist-module/ with the real
// `package` implementation of app-core-cli, so the tests register what production would load.
//
//   node scripts/build-fixtures.mjs [--out-root <dir>]
//
// Order from a clean checkout: `npm install`, `npm run build` (this script imports the compiled
// packages/app-core-cli/dist/package.js, and the server tests need the other builds), then this script.
// `npm test`, `npm run test:app`, `npm run test:cli` and `npm run test:all` run it first (pretest hooks).
// No network is used: the in-process import avoids the CLI entry point and its background updater.
//
// Without --out-root each fixture goes to <fixture>/dist-module (gitignored). With --out-root <dir> it goes
// to <dir>/<fixture>/dist-module instead (used by the fixtures test, which must not touch the real ones).
//
// Fails (exit 1, full error) when the CLI is not built, a fixture folder has no entry in VERSIONS (or an
// entry has no folder), a package step fails, or an artifact is missing afterwards. Nothing is skipped.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturesRoot = path.join(repoRoot, 'packages', 'test-app-modules');
const packageEntry = path.join(repoRoot, 'packages', 'app-core-cli', 'dist', 'package.js');

// The version stamped into each fixture's manifest: the values the tests assert. The v2 lifecycle fixture
// is a second module folder with the same id, so the update (swap) tests have a newer version to load.
export const VERSIONS = {
  'app-module-dsl-lib': '1.0.0',
  'app-module-lifecycle': '1.0.0',
  'app-module-lifecycle-v2': '2.0.0',
  // Reference module for authors; requires slot-provider, so it is built after it (see packageOrder).
  'app-module-example': '1.0.0',
  'app-module-live-page': '1.0.0',
  'app-module-live-widget': '1.0.0',
  'app-module-minimal': '1.0.0',
  'app-module-slot-contributor-a': '1.0.0',
  'app-module-slot-contributor-b': '1.0.0',
  // Built before the contributors (see packageOrder): they are checked against its dist-module.
  'app-module-slot-provider': '1.0.0',
};

function parseArgs(args) {
  if (args.length === 0) {
    return { outRoot: undefined };
  }
  if (args[0] !== '--out-root' || args[1] === undefined || args.length > 2) {
    throw new Error('Usage: node scripts/build-fixtures.mjs [--out-root <dir>]');
  }
  return { outRoot: path.resolve(args[1]) };
}

function discoverFixtures() {
  const found = fs
    .readdirSync(fixturesRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('app-module-'))
    .map((e) => e.name)
    .sort();
  const missingVersion = found.filter((name) => !(name in VERSIONS));
  if (missingVersion.length > 0) {
    throw new Error(`No version for fixture folder(s) ${missingVersion.join(', ')}: add them to VERSIONS in scripts/build-fixtures.mjs.`);
  }
  const missingFolder = Object.keys(VERSIONS).filter((name) => !found.includes(name));
  if (missingFolder.length > 0) {
    throw new Error(`VERSIONS lists ${missingFolder.join(', ')} but no such folder exists in ${fixturesRoot}: remove the entry or restore the fixture.`);
  }
  return found;
}

function readPackageJson(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesRoot, name, 'package.json'), 'utf8'));
}

// A fixture that depends (package.json) on another fixture is built after it, because `check` reads the
// provider's dist-module. Throws on a dependency cycle between fixtures.
function packageOrder(names) {
  const byPackage = new Map(names.map((name) => [readPackageJson(name).name, name]));
  const ordered = [];
  const state = new Map();
  const visit = (name, trail) => {
    if (state.get(name) === 'done') {
      return;
    }
    if (state.get(name) === 'visiting') {
      throw new Error(`Fixtures depend on each other in a cycle: ${[...trail, name].join(' -> ')}.`);
    }
    state.set(name, 'visiting');
    const dependencies = Object.keys(readPackageJson(name).dependencies ?? {});
    for (const dep of dependencies) {
      const fixture = byPackage.get(dep);
      if (fixture !== undefined) {
        visit(fixture, [...trail, name]);
      }
    }
    state.set(name, 'done');
    ordered.push(name);
  };
  names.forEach((name) => visit(name, []));
  return { ordered, byPackage };
}

async function main() {
  const { outRoot } = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(packageEntry)) {
    throw new Error(`${packageEntry} not found: build app-core-cli first with "npm run build" (from the repository root).`);
  }
  const { packageModule } = await import(pathToFileURL(packageEntry).href);

  const { ordered, byPackage } = packageOrder(discoverFixtures());
  // The fixtures are not npm workspaces, so a fixture dependency is never linked in node_modules: `check` is
  // told where each fixture package lives instead (its folder holds the dist-module that was just built).
  const links = {};
  for (const [packageName, fixture] of byPackage) {
    links[packageName] = outRoot === undefined ? path.join(fixturesRoot, fixture) : path.join(outRoot, fixture);
  }

  for (const name of ordered) {
    const moduleDir = path.join(fixturesRoot, name);
    const outDir = outRoot === undefined ? path.join(moduleDir, 'dist-module') : path.join(outRoot, name, 'dist-module');
    let result;
    try {
      result = await packageModule({ moduleDir, outDir, version: VERSIONS[name], links });
    } catch (err) {
      throw new Error(`Packaging fixture ${name} failed:\n${err instanceof Error ? err.message : String(err)}`);
    }
    if (!fs.existsSync(result.manifestPath)) {
      throw new Error(`Packaging fixture ${name} reported success but ${result.manifestPath} is missing.`);
    }
    for (const warning of result.warnings) {
      console.warn(`warning (${name}): ${warning}`);
    }
  }
  console.log(`OK: built ${Object.keys(VERSIONS).length} fixtures${outRoot === undefined ? '' : ` into ${outRoot}`}`);
}

// Only when run directly, so VERSIONS can be imported without building.
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`build-fixtures failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
