// The tray icon that lives and dies with an app-core server: opens it, shows the version and updates it.
// Modeled on the orchestrator's TrayManager (packages/orchestrator-cli/src/tray-manager.ts), without its job logic.
// Nothing here polls: the menu changes only when the user acts (check, update), because the tray exists exactly as long
// as its server does.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getErrorMessage } from '@wadeck-app/app-core-server/errors';
import { TrayProcess } from './trayProcess.js';
import { buildMenuSnapshot, type TrayActionId, type TrayState } from './trayMenu.js';

const MAX_RESTARTS = 5;

export interface TrayCompanionOptions {
  mode: TrayState['mode'];
  version: string;
  /** Where this CLI keeps its state: the staged binary and the tray log. */
  cliConfigDir: string;
  /** The server's config dir, only shown in the menu. */
  serverConfigDir: string;
  /** Path of the tray binary to spawn (already staged out of node_modules). */
  binaryPath: string;
  /** Address "Open app-core" goes to; asked at click time, so a server that moved is followed. */
  getUrl: () => string;
  openUrl: (url: string) => void;
  openFolder: (dir: string) => void;
  /** Latest published version, or throws. */
  fetchLatestVersion: () => Promise<string>;
  /** Installs the latest version (forced), or throws. */
  runUpdate: () => Promise<void>;
  /** The user chose Quit. */
  onQuit: () => void;
  /** Restarts the server. When given, the menu has Restart and an update restarts by itself. */
  onRestart?: () => void;
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
  private readonly state: TrayState;

  constructor(private readonly opts: TrayCompanionOptions) {
    this.state = {
      mode: opts.mode,
      version: opts.version,
      update: 'idle',
      latestVersion: null,
      configDir: opts.serverConfigDir,
      nodePid: process.pid,
      trayPid: null,
      canRestart: opts.onRestart !== undefined,
    };
  }

  /** Spawns the tray. Rejects when it cannot start. */
  async start(): Promise<void> {
    await this.spawn();
  }

  async stop(): Promise<void> {
    this.stopping = true;
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

  private get logFile(): string {
    return path.join(this.opts.cliConfigDir, 'logs', 'tray.log');
  }

  private log(line: string): void {
    try {
      fs.mkdirSync(path.dirname(this.logFile), { recursive: true });
      fs.appendFileSync(this.logFile, `${new Date().toISOString()} ${line}\n`);
    } catch (err) {
      // The log is a convenience; a read-only config dir must not take the tray down, but it is said on stderr.
      process.stderr.write(`[tray] cannot write ${this.logFile}: ${getErrorMessage(err)}\n`);
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
    this.state.trayPid = tp.process.pid ?? null;
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
      process.stderr.write(`[tray] the tray icon stopped ${MAX_RESTARTS} times in a row and is not restarted again; see ${this.logFile}\n`);
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
        this.opts.openUrl(this.opts.getUrl());
        break;
      case 'open-logs':
        this.opts.openFolder(path.dirname(this.logFile));
        break;
      case 'check-update':
        if (this.state.mode === 'prod' && this.state.update !== 'checking' && this.state.update !== 'updating') {
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
      this.log(`update to ${this.state.latestVersion ?? '?'} installed`);
    } catch (err) {
      this.log(`update failed: ${getErrorMessage(err)}`);
      this.state.update = 'failed';
      this.pushMenu();
      return;
    }
    this.state.update = 'updated';
    this.pushMenu();
    // "Update to vX and restart": the new version only runs once the server is started again.
    this.opts.onRestart?.();
  }
}
