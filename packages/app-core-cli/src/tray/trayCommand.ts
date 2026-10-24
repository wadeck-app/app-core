// Wires the tray companion to the real world (browser, npm, updater) for `serve` and `tray`.
import { execFile, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { getErrorMessage } from '@wadeck-app/app-core-server/errors';
import { resolveConfigDir } from '@wadeck-app/app-core-server/configDir';
import { TrayCompanion, type TrayCompanionOptions } from './trayCompanion.js';
import { trayToRun, trayUnavailableMessage } from './trayBinary.js';

export interface StartTrayOptions {
  mode: TrayCompanionOptions['mode'];
  version: string;
  /** "dsl-ui 2026.10.24-137": the dsl packages the shell was built with, shown under the version. */
  dslVersion: string | null;
  cliConfigDir: string;
  pkgName: string;
  /** app-core-cli-updater.cjs next to the bundle. */
  updaterPath: string;
  /** Address "Open app-core" goes to, asked at click time. */
  getUrl: () => string;
  onQuit: () => void;
  /** Given only where the tray's owner can start the server again. */
  onRestart?: () => void;
}

export type StartTrayResult = { ok: true; companion: TrayCompanion } | { ok: false; reason: string };

function openUrl(url: string): void {
  const done = (err: Error | null): void => {
    if (err) {
      process.stderr.write(`[tray] could not open ${url}: ${getErrorMessage(err)}\n`);
    }
  };
  if (process.platform === 'win32') {
    // `start` is a cmd builtin; the empty title keeps the URL from being read as one.
    execFile('cmd.exe', ['/c', 'start', '', url], { windowsHide: true }, done);
  } else {
    // macOS: windowsHide has no meaning here, and opening the browser is the point.
    execFile('open', [url], done);
  }
}

function openFolder(dir: string): void {
  const done = (err: Error | null): void => {
    if (err) {
      process.stderr.write(`[tray] could not open ${dir}: ${getErrorMessage(err)}\n`);
    }
  };
  if (process.platform === 'win32') {
    // Passed without quotes: execFile is not a shell, quotes would become part of the path.
    execFile('cmd.exe', ['/c', 'start', '', dir], { windowsHide: true }, done);
  } else {
    execFile('open', [dir], done);
  }
}

function fetchLatestVersion(pkgName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // shell: true so npm resolves to npm.cmd on Windows.
    execFile('npm', ['view', pkgName, 'version', '--json'], { timeout: 15_000, shell: true, windowsHide: true }, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()) as string);
      } catch {
        reject(new Error(`unexpected "npm view ${pkgName} version" output: ${stdout.trim().slice(0, 200)}`));
      }
    });
  });
}

// Same as `app-core-cli update`: the updater with UPDATER_FORCE, so it installs without waiting for its own schedule.
function runUpdate(updaterPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(updaterPath)) {
      reject(new Error(`updater not found at ${updaterPath} (a checkout has none: install with npm install -g @wadeck-app/app-core-cli)`));
      return;
    }
    const child = spawn(process.execPath, [updaterPath], { env: { ...process.env, UPDATER_FORCE: '1' }, stdio: 'ignore', windowsHide: true });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`updater exited with code ${code}`))));
  });
}

/**
 * Starts the tray. Never throws: a missing binary or a tray that fails to start is a reason the caller reports, because
 * the server must keep running without its icon.
 */
export async function startTray(options: StartTrayOptions): Promise<StartTrayResult> {
  let binaryPath: string | null;
  try {
    binaryPath = trayToRun(options.cliConfigDir);
  } catch (err) {
    return { ok: false, reason: getErrorMessage(err) };
  }
  if (binaryPath === null) {
    return { ok: false, reason: trayUnavailableMessage() };
  }
  if (process.platform !== 'win32') {
    fs.chmodSync(binaryPath, 0o755);
  }
  const companion = new TrayCompanion({
    serverConfigDir: resolveConfigDir(),
    cliConfigDir: options.cliConfigDir,
    version: options.version,
    dslVersion: options.dslVersion,
    mode: options.mode,
    binaryPath,
    getUrl: options.getUrl,
    openUrl,
    openFolder,
    fetchLatestVersion: () => fetchLatestVersion(options.pkgName),
    runUpdate: () => runUpdate(options.updaterPath),
    onQuit: options.onQuit,
    onRestart: options.onRestart,
  });
  try {
    await companion.start();
  } catch (err) {
    await companion.stop();
    return { ok: false, reason: `the tray did not start: ${getErrorMessage(err)}` };
  }
  return { ok: true, companion };
}
