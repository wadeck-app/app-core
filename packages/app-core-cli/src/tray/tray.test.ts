import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TRAY_ICONS } from './trayIcons.js';
import { buildMenuSnapshot, type TrayState } from './trayMenu.js';
import { pruneStagedBinaries, stageBinary, stagedBinaryPath } from './trayBinary.js';
import { TrayCompanion } from './trayCompanion.js';
import type { TrayProcess, MenuSnapshot } from './trayProcess.js';

const dirs: string[] = [];
function tmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-cli-tray-test-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const base: TrayState = {
  mode: 'prod',
  version: '2026.10.23-10',
  update: 'idle',
  failure: null,
  latestVersion: null,
  configDir: '/home/u/.config/app-core',
  nodePid: 111,
  trayPid: 222,
  canRestart: true,
};
const ids = (menu: MenuSnapshot): string[] => menu.items.filter((item) => item.type === 'normal').map((item) => item.id);
const item = (menu: MenuSnapshot, id: string) => menu.items.find((entry) => entry.id === id);

function pngSize(base64: string): { width: number; height: number } {
  const png = Buffer.from(base64, 'base64');
  expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe('tray icons', () => {
  it('has a 64x64 PNG per state, all different', () => {
    for (const icon of Object.values(TRAY_ICONS)) {
      expect(pngSize(icon)).toEqual({ width: 64, height: 64 });
    }
    expect(new Set(Object.values(TRAY_ICONS)).size).toBe(3);
  });
});

describe('tray menu', () => {
  it('is laid out like orchestrator: header with PIDs, version, config, status, then actions', () => {
    const menu = buildMenuSnapshot(base);
    expect(menu.items.map((entry) => entry.id)).toEqual([
      'header', 'check-update', 'config-dir', 'sep1', 'status', 'sep2', 'open', 'open-logs', 'sep3', 'restart', 'quit',
    ]);
    expect(item(menu, 'header')).toMatchObject({ title: 'app-core (prod) [node:111 tray:222]', enabled: false });
    expect(item(menu, 'config-dir')?.title).toBe('Config: /home/u/.config/app-core');
    expect(item(menu, 'status')?.title).toBe('app-core is running');
  });

  it('uses the green icon in prod, the blue one in dev', () => {
    expect(buildMenuSnapshot(base).icon).toBe(TRAY_ICONS.prod);
    expect(buildMenuSnapshot({ ...base, mode: 'dev' }).icon).toBe(TRAY_ICONS.dev);
  });

  it('uses the amber icon for anything to look at, in both modes', () => {
    for (const update of ['checking', 'available', 'updating', 'updated', 'failed'] as const) {
      expect(buildMenuSnapshot({ ...base, update }).icon).toBe(TRAY_ICONS.info);
    }
    expect(buildMenuSnapshot({ ...base, update: 'up-to-date' }).icon).toBe(TRAY_ICONS.prod);
    expect(buildMenuSnapshot({ ...base, mode: 'dev', update: 'available' }).icon).toBe(TRAY_ICONS.info);
  });

  it('offers the update only once one is available', () => {
    expect(ids(buildMenuSnapshot(base))).not.toContain('update-install');
    const menu = buildMenuSnapshot({ ...base, update: 'available', latestVersion: '2026.10.24-1' });
    expect(item(menu, 'update-install')).toMatchObject({ title: 'Update to v2026.10.24-1 and restart', enabled: true });
    expect(item(menu, 'status')?.title).toBe('Update available: v2026.10.24-1');
  });

  it('says in the menu why the icon is amber, for every amber state', () => {
    const failure = { step: 'install' as const, message: 'npm exploded' };
    const expected: Array<[TrayState['update'], RegExp]> = [
      ['checking', /Checking for an update/],
      ['available', /Update available: v1/],
      ['updating', /Updating/],
      ['updated', /Updated to v1: restart/],
      ['failed', /\[fail\] Update install failed: npm exploded/],
    ];
    for (const [update, pattern] of expected) {
      const menu = buildMenuSnapshot({ ...base, update, latestVersion: '1', failure: update === 'failed' ? failure : null });
      expect(menu.icon).toBe(TRAY_ICONS.info);
      expect(item(menu, 'status')?.title).toMatch(pattern);
    }
  });

  it('blocks the version item while checking or updating', () => {
    expect(item(buildMenuSnapshot({ ...base, update: 'checking' }), 'check-update')?.enabled).toBe(false);
    const updating = buildMenuSnapshot({ ...base, update: 'updating' });
    expect(item(updating, 'check-update')?.enabled).toBe(false);
    expect(item(updating, 'update-install')).toMatchObject({ title: 'Updating...', enabled: false });
  });

  it('has no update check in dev: a dev build has nothing to update to', () => {
    const menu = buildMenuSnapshot({ ...base, mode: 'dev', version: 'dev 3474ba9c' });
    expect(item(menu, 'check-update')).toMatchObject({ title: 'dev 3474ba9c', enabled: false });
  });

  it('shows Restart only where the owner can restart the server', () => {
    expect(ids(buildMenuSnapshot(base))).toContain('restart');
    expect(ids(buildMenuSnapshot({ ...base, canRestart: false }))).not.toContain('restart');
  });

  it('leaves the tray PID out until it is known', () => {
    expect(item(buildMenuSnapshot({ ...base, trayPid: null }), 'header')?.title).toBe('app-core (prod) [node:111]');
  });

  // The Go tray's pipe corrupts on non-ASCII text (lesson from wdrive's systray2).
  it.each(['idle', 'checking', 'up-to-date', 'available', 'updating', 'updated', 'failed'] as const)('uses ASCII only in titles (%s)', (update) => {
    for (const mode of ['dev', 'prod'] as const) {
      for (const entry of buildMenuSnapshot({ ...base, mode, update, latestVersion: '1' }).items) {
        expect(entry.title).toMatch(/^[\x20-\x7e]*$/);
      }
    }
  });
});

describe('staged binary', () => {
  it('copies the binary out once per stamp and reuses the copy', () => {
    const source = path.join(tmp(), 'app-core-tray.exe');
    fs.writeFileSync(source, 'binary-v1');
    const configDir = tmp();
    const staged = stageBinary(source, configDir, 'stamp-1');
    expect(staged).toBe(stagedBinaryPath(configDir, 'stamp-1', 'app-core-tray.exe'));
    expect(fs.readFileSync(staged, 'utf8')).toBe('binary-v1');
    const before = fs.statSync(staged).mtimeMs;
    expect(stageBinary(source, configDir, 'stamp-1')).toBe(staged);
    expect(fs.statSync(staged).mtimeMs).toBe(before);
  });

  it('replaces a short copy left by an interrupted run', () => {
    const source = path.join(tmp(), 'app-core-tray.exe');
    fs.writeFileSync(source, 'full-binary');
    const configDir = tmp();
    const target = stagedBinaryPath(configDir, 's', 'app-core-tray.exe');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'ful');
    stageBinary(source, configDir, 's');
    expect(fs.readFileSync(target, 'utf8')).toBe('full-binary');
  });

  it('fails loudly when the source is missing', () => {
    expect(() => stageBinary(path.join(tmp(), 'nope.exe'), tmp(), 's')).toThrow(/not readable/);
  });

  it('prunes the other versions and keeps the current one', () => {
    const configDir = tmp();
    for (const stamp of ['old-1', 'old-2', 'current']) {
      fs.mkdirSync(path.join(configDir, 'bin', stamp), { recursive: true });
    }
    expect(pruneStagedBinaries(configDir, 'current')).toBe(2);
    expect(fs.readdirSync(path.join(configDir, 'bin'))).toEqual(['current']);
  });
});

class FakeTray {
  sent: Array<{ type: string; menu?: MenuSnapshot }> = [];
  killed = false;
  process = { pid: 222 };
  private click: (id: string) => void = () => undefined;
  onStderrLine(): void {}
  onClicked(cb: (id: string) => void): void {
    this.click = cb;
  }
  onExit(): void {}
  onError(): void {}
  capturedStderr(): string {
    return '';
  }
  async ready(): Promise<void> {}
  async send(msg: { type: string; menu?: MenuSnapshot }): Promise<void> {
    this.sent.push(msg);
  }
  async kill(): Promise<void> {
    this.killed = true;
  }
  press(id: string): void {
    this.click(id);
  }
  lastMenu(): MenuSnapshot {
    return this.sent.filter((msg) => msg.menu).at(-1)!.menu!;
  }
}

describe('TrayCompanion', () => {
  function setup(overrides: Partial<ConstructorParameters<typeof TrayCompanion>[0]> = {}) {
    const fake = new FakeTray();
    const cliConfigDir = tmp();
    const calls = { open: [] as string[], folders: [] as string[], quit: 0, restart: 0, update: 0 };
    const companion = new TrayCompanion({
      mode: 'prod',
      version: '2026.10.23-10',
      cliConfigDir,
      serverConfigDir: tmp(),
      binaryPath: 'unused',
      getUrl: () => 'http://127.0.0.1:4850/',
      openUrl: (url) => calls.open.push(url),
      openFolder: (dir) => calls.folders.push(dir),
      fetchLatestVersion: async () => '2026.10.24-1',
      runUpdate: async () => {
        calls.update++;
      },
      onQuit: () => {
        calls.quit++;
      },
      onRestart: () => {
        calls.restart++;
      },
      createProcess: () => fake as unknown as TrayProcess,
      ...overrides,
    });
    return { companion, fake, calls, cliConfigDir };
  }
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

  it('sends the init menu once and never refreshes it on its own', async () => {
    const { companion, fake } = setup();
    await companion.start();
    await settle();
    await settle();
    expect(fake.sent.map((msg) => msg.type)).toEqual(['init']);
    expect(item(fake.lastMenu(), 'header')?.title).toBe('app-core (prod) [node:' + process.pid + ' tray:222]');
    await companion.stop();
    expect(fake.killed).toBe(true);
  });

  it('opens the address asked at click time, the logs folder, and quits', async () => {
    let url = 'http://127.0.0.1:4850/';
    const { companion, fake, calls, cliConfigDir } = setup({ getUrl: () => url });
    await companion.start();
    url = 'http://127.0.0.1:4851/';
    fake.press('open');
    fake.press('open-logs');
    fake.press('quit');
    expect(calls.open).toEqual(['http://127.0.0.1:4851/']);
    expect(calls.folders).toEqual([path.join(cliConfigDir, 'logs')]);
    expect(calls.quit).toBe(1);
    await companion.stop();
  });

  it('checks for an update, then installs it and restarts when asked', async () => {
    const { companion, fake, calls } = setup();
    await companion.start();
    fake.press('check-update');
    await settle();
    expect(companion.snapshotState().update).toBe('available');
    expect(item(fake.lastMenu(), 'update-install')?.title).toBe('Update to v2026.10.24-1 and restart');
    fake.press('update-install');
    await settle();
    expect(calls.update).toBe(1);
    expect(calls.restart).toBe(1);
    await companion.stop();
  });

  it('says a restart is needed when the owner cannot restart by itself', async () => {
    const { companion, fake, calls } = setup({ onRestart: undefined });
    await companion.start();
    fake.press('check-update');
    await settle();
    fake.press('update-install');
    await settle();
    expect(calls.update).toBe(1);
    expect(item(fake.lastMenu(), 'status')?.title).toBe('Updated to v2026.10.24-1: restart app-core to apply');
    await companion.stop();
  });

  it('reports up to date when the published version is the running one (git hash ignored)', async () => {
    const { companion, fake } = setup({ fetchLatestVersion: async () => '2026.10.23-10-abcdef12' });
    await companion.start();
    fake.press('check-update');
    await settle();
    expect(companion.snapshotState().update).toBe('up-to-date');
    await companion.stop();
  });

  it('shows a failed check instead of hiding it, and can retry', async () => {
    const fetchLatestVersion = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('2026.10.24-1');
    const { companion, fake } = setup({ fetchLatestVersion });
    await companion.start();
    fake.press('check-update');
    await settle();
    expect(companion.snapshotState().update).toBe('failed');
    expect(item(fake.lastMenu(), 'status')?.title).toBe('[fail] Update check failed: offline');
    expect(item(fake.lastMenu(), 'check-update')?.enabled).toBe(true);
    fake.press('check-update');
    await settle();
    expect(companion.snapshotState().update).toBe('available');
    await companion.stop();
  });

  it('keeps the old version running and says so when the install fails', async () => {
    const { companion, fake, calls } = setup({
      runUpdate: async () => {
        throw new Error('npm exploded');
      },
    });
    await companion.start();
    fake.press('check-update');
    await settle();
    fake.press('update-install');
    await settle();
    expect(companion.snapshotState().update).toBe('failed');
    expect(item(fake.lastMenu(), 'status')?.title).toBe('[fail] Update install failed: npm exploded');
    expect(calls.restart).toBe(0);
    await companion.stop();
  });

  it('never checks for updates in dev', async () => {
    const fetchLatestVersion = vi.fn().mockResolvedValue('2026.10.24-1');
    const { companion, fake } = setup({ mode: 'dev', onRestart: undefined, fetchLatestVersion });
    await companion.start();
    fake.press('check-update');
    await settle();
    expect(fetchLatestVersion).not.toHaveBeenCalled();
    await companion.stop();
  });

  it('does not install when no update was found', async () => {
    const { companion, fake, calls } = setup();
    await companion.start();
    fake.press('update-install');
    await settle();
    expect(calls.update).toBe(0);
    await companion.stop();
  });
});
