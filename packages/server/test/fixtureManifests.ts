import { afterAll } from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
export const fixturesDir = path.join(__dirname, '..', '..', 'test-app-modules');

// The packaged manifest of a fixture module (`app-core-cli package` output, built by
// scripts/build-fixtures.mjs before the tests). Throws when it is missing instead of letting the test
// fail later with an obscure "manifest not found" from the loader.
export function fixtureManifest(fixture: string): string {
  const manifest = path.join(fixturesDir, fixture, 'dist-module', 'manifest.json');
  if (!fs.existsSync(manifest)) {
    throw new Error(
      `${manifest} is missing: the fixtures are not built. Run "npm run build" then "node scripts/build-fixtures.mjs" from the repository root (npm test does it for you).`,
    );
  }
  return manifest;
}

const scratchDirs: string[] = [];

afterAll(() => {
  for (const dir of scratchDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// A fresh config dir (data/ and state/ of the modules go under it) removed after the test file ran, so a
// ModuleManager never writes to the real ~/.config/app-core.
export function scratchConfigDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-cfg-'));
  scratchDirs.push(dir);
  return dir;
}
