// The tray icon that goes with the app-core server: shows whether it runs, opens it, shows the version and updates it.
// Modeled on the orchestrator's TrayManager (packages/orchestrator-cli/src/tray-manager.ts), without its job logic.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getErrorMessage } from '@wadeck-app/app-core-server/errors';
import { portFilePath } from '@wadeck-app/app-core-server/portFile';
import { TrayProcess } from './trayProcess.js';
import { buildMenuSnapshot, type TrayActionId, type TrayState } from './trayMenu.js';

const MAX_RESTARTS = 5;
const DEFAULT_POLL_MS = 3_000;

export interface RunningServer {
  pid: number;
  port: number;
}

/** The server described by its port file, or null when it is not running (no file, unreadable, or its pid is gone). */
export function readRunningServer(configDir: string): RunningServer | null {
  let parsed: { pid?: unknown; port?: unknown };
  try {
    parsed = JSON.parse(fs.readFileSync(portFilePath(configDir), 'utf8')) as { pid?: unknown; port?: unknown };
  } catch {
    return null;
  }
  const { pid, port } = parsed;
  if (typeof pid !== 'number' || typeof port !== 'number' || !Number.isInteger(port) || port <= 0 || port > 65535) {
    return null;
  }
  try {
    // Signal 0 only checks that the process exists.
    process.kill(pid, 0);
  } catch (err) {
    // EPERM: it exists but belongs to someone else, which still means a server is there.
    if ((err as NodeJS.ErrnoException).code !== 'EPERM') {
      return null;
    }
  }
  return { pid, port };
}

export interface TrayCompanionOptions {
  /** Where the server publishes server.port.json. */
  serverConfigDir: string;
  /** Where this CLI keeps its state: the staged binary and the tray log. */
  cliConfigDir: string;
  version: string;
  mode: TrayState['mode'];
  /** Path of the tray binary to spawn (already staged out of node_modules). */
  binaryPath: string;
  openUrl: (url: string) => void;
  /** Latest published version, or throws. */
  fetchLatestVersion: () => Promise<string>;
  /** Installs the latest version (forced), or throws. */
  runUpdate: () => Promise<void>;
  /** The user chose Quit. */
  onQuit: () => void;
  /** The user chose "Restart to apply the update" (serve mode only). */
  onRestart?: () => void;
  pollMs?: number;
  /** Test seam. */
  createProcess?: (binaryPath: string) => TrayProcess;
}

// The trailing git hash and the dev marker are display-only: without stripping them a dev build would report an update
// forever (its version never equals the published one).
function normalizeVersion(version: string): string {
  return version.replace(/-local-dev$/, '').replace(/-[0-9a-f]{6,8}$/, '');
}

export class TrayCompanion {
  private tp: TrayProcess | null = null;
  private stopping = false;
  private restartAttempt = 0;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private readonly state: TrayState;

  constructor(private readonly opts: TrayCompanionOptions) {
    this.state = { port: null, version: opts.version, update: 'idle', latestVersion: null, mode: opts.mode };
  }

  /** Spawns the tray and starts following the server. Rejects when the tray cannot start. */
  async start(): Promise<void> {
    this.refreshServer();
    await this.spawn();
    this.pollTimer = setInterval(() => {
      if (this.refreshServer()) {
        this.pushMenu();
      }
    }, this.opts.pollMs ?? DEFAULT_POLL_MS);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const tp = this.tp;
    this.tp = null;
    if (tp) {
      await tp.kill();
    }
  }

  /** Current state, for tests. */
  snapshotState(): Readonly<TrayState> {
    return this.state;
  }

  /** Re-reads the port file. True when what the menu shows changed. */
  private refreshServer(): boolean {
    const port = readRunningServer(this.opts.serverConfigDir)?.port ?? null;
    const changed = port !== this.state.port;
    this.state.port = port;
    return changed;
  }

  private log(line: string): void {
    const file = path.join(this.opts.cliConfigDir, 'logs', 'tray.log');
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, `${new Date().toISOString()} ${line}\n`);
    } catch (err) {
      // The log is a convenience; a read-only config dir must not take the tray down, but it is said once on stderr.
      process.stderr.write(`[tray] cannot write ${file}: ${getErrorMessage(err)}\n`);
    }
  }

  private pushMenu(): void {
    const tp = this.tp;
    if (!tp || tp.killed) {
      return;
    }
    tp.send({ type: 'set-menu', menu: buildMenuSnapshot(this.state) }).catch((err: unknown) => {
      this.log(`set-menu failed: ${getErrorMessage(err)}`);
    });
  }

  private async spawn(): Promise<void> {
    const tp = this.opts.createProcess?.(this.opts.binaryPath) ?? new TrayProcess(this.opts.binaryPath);
    this.tp = tp;
    tp.onStderrLine((line) => this.log(line));
    tp.onClicked((id) => this.handleClick(id));
    tp.onExit((code) => {
      this.log(`tray exited with code=${code} stderr=${JSON.stringify(tp.capturedStderr().slice(-500))}`);
      if (this.tp === tp) {
        this.tp = null;
      }
      if (!this.stopping && code !== 0 && code !== null) {
        this.scheduleRestart();
      }
    });
    tp.onError((err) => {
      this.log(`spawn error: ${getErrorMessage(err)}`);
      if (this.tp === tp) {
        this.tp = null;
      }
      if (!this.stopping) {
        this.scheduleRestart();
      }
    });
    await tp.ready();
    this.restartAttempt = 0;
    await tp.send({ type: 'init', menu: buildMenuSnapshot(this.state) });
  }

  private scheduleRestart(): void {
    if (this.restartTimer) {
      return;
    }
    if (this.restartAttempt >= MAX_RESTARTS) {
      this.log(`tray gave up after ${MAX_RESTARTS} restarts`);
      process.stderr.write(`[tray] the tray icon stopped ${MAX_RESTARTS} times in a row and is not restarted again; see ${path.join(this.opts.cliConfigDir, 'logs', 'tray.log')}\n`);
      return;
    }
    const delay = Math.min(1000 * 2 ** this.restartAttempt, 30_000);
    this.restartAttempt++;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.spawn().catch((err: unknown) => {
        this.log(`restart failed: ${getErrorMessage(err)}`);
        this.scheduleRestart();
      });
    }, delay);
  }

  private handleClick(id: string): void {
    this.log(`click ${id}`);
    switch (id as TrayActionId) {
      case 'open':
        if (this.state.port !== null) {
          this.opts.openUrl(`http://127.0.0.1:${this.state.port}/`);
        }
        break;
      case 'check-update':
        if (this.state.update !== 'checking' && this.state.update !== 'updating') {
          void this.checkForUpdate();
        }
        break;
      case 'update-install':
        if (this.state.update === 'available') {
          void this.installUpdate();
        }
        break;
      case 'restart':
        this.opts.onRestart?.();
        break;
      case 'quit':
        this.opts.onQuit();
        break;
      default:
        this.log(`unknown action ${id}`);
    }
  }

  private async checkForUpdate(): Promise<void> {
    this.state.update = 'checking';
    this.pushMenu();
    try {
      const latest = await this.opts.fetchLatestVersion();
      this.state.latestVersion = latest;
      this.state.update = normalizeVersion(latest) !== normalizeVersion(this.state.version) ? 'available' : 'up-to-date';
      this.log(`check-update: latest=${latest} current=${this.state.version} -> ${this.state.update}`);
    } catch (err) {
      this.log(`check-update failed: ${getErrorMessage(err)}`);
      this.state.update = 'failed';
    }
    this.pushMenu();
  }

  private async installUpdate(): Promise<void> {
    this.state.update = 'updating';
    this.pushMenu();
    try {
      await this.opts.runUpdate();
      this.state.update = 'updated';
      this.log(`update to ${this.state.latestVersion ?? '?'} installed`);
    } catch (err) {
      this.log(`update failed: ${getErrorMessage(err)}`);
      this.state.update = 'failed';
    }
    this.pushMenu();
  }
}
