// Locates the tray binary of this install and copies it out of node_modules before it is run.
//
// Adapted from the orchestrator repo (packages/orchestrator-cli/src/platform-binary.ts), tray part only.
// The binary lives in a per-platform package (@wadeck-app/app-core-cli-<platform>) pinned to an exact version by CI and
// republished only when the binary changes, so updating app-core-cli updates the tray iff it changed.
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getErrorMessage } from '@wadeck-app/app-core-server/errors';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

const PLATFORM_PKG: Record<string, string> = {
  'win32-x64': '@wadeck-app/app-core-cli-win32-x64',
  'darwin-arm64': '@wadeck-app/app-core-cli-darwin-arm64',
  'darwin-x64': '@wadeck-app/app-core-cli-darwin-x64',
};

// Inside the platform package the arch is in the package name, so the file is named plainly. The dev build in
// tray-go/dist keeps the arch suffix.
const TRAY_IN_PLATFORM_PKG = process.platform === 'win32' ? 'app-core-tray.exe' : 'app-core-tray';

// Keyed on platform and arch: a bare arch test would return the darwin binary on a Linux checkout.
const TRAY_DEV_NAME: Record<string, string> = {
  'win32-x64': 'app-core-tray.exe',
  'darwin-arm64': 'app-core-tray-arm64',
  'darwin-x64': 'app-core-tray-amd64',
};

function platformKey(): string {
  return `${process.platform}-${process.arch === 'arm64' ? 'arm64' : 'x64'}`;
}

/** npm package holding the tray binary for the running platform, or null if there is none (Linux, 32-bit...). */
export function platformPackage(): string | null {
  return PLATFORM_PKG[platformKey()] ?? null;
}

/** What to tell the user when no tray binary can be found. */
export function trayUnavailableMessage(): string {
  const pkg = platformPackage();
  if (!pkg) {
    return `no tray for ${process.platform}-${process.arch} (supported: ${Object.keys(PLATFORM_PKG).join(', ')})`;
  }
  return `tray binary not found: expected in ${pkg}, or in tray-go/dist for a checkout (npm run build-tray --workspace=packages/app-core-cli). Reinstall with: npm install -g @wadeck-app/app-core-cli`;
}

function resolveInPlatformPackage(fileName: string): string | null {
  const pkg = platformPackage();
  if (!pkg) {
    return null;
  }
  try {
    return require.resolve(`${pkg}/${fileName}`);
  } catch {
    // Platform package absent: a checkout, or optionalDependencies skipped.
    return null;
  }
}

/** The tray binary as installed (inside node_modules) or as built in a checkout, or null. */
export function findTrayBinary(): string | null {
  const fromPkg = resolveInPlatformPackage(TRAY_IN_PLATFORM_PKG);
  if (fromPkg) {
    return fromPkg;
  }
  const devName = TRAY_DEV_NAME[platformKey()];
  if (!devName) {
    return null;
  }
  // dist/cli.bundle.js (published) and dist/tray/trayBinary.js (tsc) sit at different depths.
  const candidates = [path.join(here, '..', 'tray-go', 'dist', devName), path.join(here, '..', '..', 'tray-go', 'dist', devName)];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

/** Where a binary is run from: `<configDir>/bin/<stamp>/<name>`, outside node_modules. */
export function stagedBinaryPath(configDir: string, stamp: string, fileName: string): string {
  return path.join(configDir, 'bin', stamp, fileName);
}

/**
 * Copies a binary out of node_modules, once per stamp, and returns the path to run.
 *
 * Why: npm cannot move a package directory that holds a running image on Windows (EPERM, then a file-by-file copy that
 * fails with EBUSY), so the tray must never run from where npm installed it. Throws instead of falling back to the
 * source path: a silent fallback would bring the EBUSY back without a word.
 */
export function stageBinary(source: string, configDir: string, stamp: string): string {
  const target = stagedBinaryPath(configDir, stamp, path.basename(source));
  let sourceSize: number;
  try {
    sourceSize = fs.statSync(source).size;
  } catch (err) {
    throw new Error(`Cannot stage the tray binary: ${source} is not readable (${getErrorMessage(err)}).`);
  }
  try {
    if (fs.statSync(target).size === sourceSize) {
      return target;
    }
  } catch {
    // Not staged yet: the normal path on a new version.
  }
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // Written beside the target then renamed, so an interrupted copy cannot leave a short file at the path that is run.
    const partial = `${target}.partial`;
    fs.copyFileSync(source, partial);
    fs.renameSync(partial, target);
  } catch (err) {
    throw new Error(
      `Cannot stage the tray binary to ${target} (${getErrorMessage(err)}). It is copied out of node_modules on purpose: ` +
        `npm cannot update a package while one of its binaries is running (${source}).`,
    );
  }
  return target;
}

/** Deletes staged copies of other versions. A copy still running is skipped (Windows refuses), the next start retries. */
export function pruneStagedBinaries(configDir: string, keepStamp: string): number {
  const root = path.join(configDir, 'bin');
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return 0;
  }
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === keepStamp) {
      continue;
    }
    try {
      fs.rmSync(path.join(root, entry.name), { recursive: true });
      removed++;
    } catch {
      // Still in use.
    }
  }
  return removed;
}

/**
 * Version of the installed platform package, used as the staging stamp: it changes exactly when the binary does, unlike
 * the main package's version, which would recopy the binary on every release.
 */
function platformPackageVersion(): string | null {
  const pkg = platformPackage();
  if (!pkg) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(require.resolve(`${pkg}/package.json`), 'utf8')) as { version?: string };
    return parsed.version ?? null;
  } catch {
    return null;
  }
}

/**
 * The tray binary to spawn, or null when there is none. A copy found in node_modules is staged; a checkout build is
 * returned untouched (nothing npm-managed is at stake, and a frozen copy would run yesterday's build).
 */
export function trayToRun(configDir: string): string | null {
  const resolved = findTrayBinary();
  if (resolved === null) {
    return null;
  }
  if (!resolved.includes('node_modules')) {
    return resolved;
  }
  const stamp = platformPackageVersion();
  if (stamp === null) {
    throw new Error(
      `Found the tray binary at ${resolved} but could not read the version of ${platformPackage()}, which names its copy. ` +
        'Reinstall with: npm install -g @wadeck-app/app-core-cli',
    );
  }
  pruneStagedBinaries(configDir, stamp);
  return stageBinary(resolved, configDir, stamp);
}
