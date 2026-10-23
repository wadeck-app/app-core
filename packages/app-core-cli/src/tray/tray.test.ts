import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { iconPng } from './trayIcons.js';
import { buildMenuSnapshot, type TrayState } from './trayMenu.js';
import { pruneStagedBinaries, stageBinary, stagedBinaryPath } from './trayBinary.js';
import { readRunningServer, TrayCompanion } from './trayCompanion.js';
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

const base: TrayState = { port: 4850, version: '2026.10.23-10', update: 'idle', latestVersion: null, mode: 'serve' };
const ids = (menu: MenuSnapshot): string[] => menu.items.filter((item) => item.type === 'normal').map((item) => item.id);
const item = (menu: MenuSnapshot, id: string) => menu.items.find((entry) => entry.id === id);

describe('tray icons', () => {
  it('draws a valid 64x64 RGBA PNG that is not empty', () => {
    const png = iconPng('running');
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.readUInt32BE(16)).toBe(64);
    expect(png.readUInt32BE(20)).toBe(64);
    // IDAT starts after the 8-byte signature and the 25-byte IHDR chunk; its length is the first field.
    const idatLength = png.readUInt32BE(33);
    const raw = zlib.inflateSync(png.subarray(41, 41 + idatLength));
    expect(raw.length).toBe(64 * (1 + 64 * 4));
    expect(raw.some((byte, index) => index % (1 + 64 * 4) !== 0 && byte !== 0)).toBe(true);
  });

  it('uses a different picture per state', () => {
    const states = ['running', 'stopped', 'update', 'busy'] as const;
    expect(new Set(states.map((state) => iconPng(state).toString('base64'))).size).toBe(4);
  });
});

describe('tray menu', () => {
  it('shows the port and offers to open a running server', () => {
    const menu = buildMenuSnapshot(base);
    expect(item(menu, 'status')).toMatchObject({ title: 'app-core is running on port 4850', enabled: false });
    expect(item(menu, 'open')?.enabled).toBe(true);
    expect(menu.tooltip).toBe('app-core (port 4850)');
  });

  it('disables Open when the server is not running', () => {
    const menu = buildMenuSnapshot({ ...base, port: null });
    expect(item(menu, 'status')?.title).toBe('app-core is not running');
    expect(item(menu, 'open')?.enabled).toBe(false);
  });

  it('shows the version, and the update item only once one is available', () => {
    expect(item(buildMenuSnapshot(base), 'check-update')?.title).toContain('v2026.10.23-10');
    expect(ids(buildMenuSnapshot(base))).not.toContain('update-install');
    const menu = buildMenuSnapshot({ ...base, update: 'available', latestVersion: '2026.10.24-1' });
    expect(item(menu, 'update-install')).toMatchObject({ title: 'Update to v2026.10.24-1', enabled: true });
  });

  it('blocks the version item while checking or updating', () => {
    expect(item(buildMenuSnapshot({ ...base, update: 'checking' }), 'check-update')?.enabled).toBe(false);
    expect(item(buildMenuSnapshot({ ...base, update: 'updating' }), 'check-update')?.enabled).toBe(false);
  });

  it('offers a restart after an update only when the tray owns the server', () => {
    expect(ids(buildMenuSnapshot({ ...base, update: 'updated', latestVersion: '2026.10.24-1' }))).toContain('restart');
    expect(ids(buildMenuSnapshot({ ...base, update: 'updated', latestVersion: '2026.10.24-1', mode: 'watch' }))).not.toContain('restart');
  });

  it('names Quit for what it stops', () => {
    expect(item(buildMenuSnapshot(base), 'quit')?.title).toBe('Quit app-core');
    expect(item(buildMenuSnapshot({ ...base, mode: 'watch' }), 'quit')?.title).toBe('Quit tray');
  });

  // The Go tray's pipe corrupts on non-ASCII text (lesson from wdrive's systray2).
  it.each([
    ['running', base],
    ['stopped', { ...base, port: null }],
    ['update available', { ...base, update: 'available', latestVersion: '1' } as TrayState],
    ['failed', { ...base, update: 'failed' } as TrayState],
  ])('uses ASCII only in titles (%s)', (_name, state) => {
    for (const entry of buildMenuSnapshot(state).items) {
      expect(entry.title).toMatch(/^[\x20-\x7e]*$/);
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

describe('readRunningServer', () => {
  function writePort(configDir: string, content: string): void {
    fs.writeFileSync(path.join(configDir, 'server.port.json'), content);
  }

  it('reads the port of a live server', () => {
    const configDir = tmp();
    writePort(configDir, JSON.stringify({ pid: process.pid, port: 4850 }));
    expect(readRunningServer(configDir)).toEqual({ pid: process.pid, port: 4850 });
  });

  it('says not running when the file is missing, unreadable or has a dead pid', () => {
    const configDir = tmp();
    expect(readRunningServer(configDir)).toBeNull();
    writePort(configDir, 'not json');
    expect(readRunningServer(configDir)).toBeNull();
    writePort(configDir, JSON.stringify({ pid: 2 ** 22 + 12345, port: 4850 }));
    expect(readRunningServer(configDir)).toBeNull();
    writePort(configDir, JSON.stringify({ pid: process.pid, port: 'x' }));
    expect(readRunningServer(configDir)).toBeNull();
  });
});

class FakeTray {
  sent: Array<{ type: string; menu?: MenuSnapshot }> = [];
  killed = false;
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
    const serverDir = tmp();
    fs.writeFileSync(path.join(serverDir, 'server.port.json'), JSON.stringify({ pid: process.pid, port: 4850 }));
    const fake = new FakeTray();
    const calls = { open: [] as string[], quit: 0, restart: 0, update: 0 };
    const companion = new TrayCompanion({
      serverConfigDir: serverDir,
      cliConfigDir: tmp(),
      version: '2026.10.23-10',
      mode: 'serve',
      binaryPath: 'unused',
      openUrl: (url) => calls.open.push(url),
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
      pollMs: 20,
      createProcess: () => fake as unknown as TrayProcess,
      ...overrides,
    });
    return { companion, fake, calls, serverDir };
  }
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 30));

  it('sends the init menu with the running server, opens it and quits on click', async () => {
    const { companion, fake, calls } = setup();
    await companion.start();
    expect(fake.sent[0]?.type).toBe('init');
    expect(fake.lastMenu().items.find((entry) => entry.id === 'status')?.title).toContain('4850');
    fake.press('open');
    fake.press('quit');
    expect(calls.open).toEqual(['http://127.0.0.1:4850/']);
    expect(calls.quit).toBe(1);
    await companion.stop();
    expect(fake.killed).toBe(true);
  });

  it('follows the server going away and coming back', async () => {
    const { companion, fake, serverDir } = setup();
    await companion.start();
    fs.rmSync(path.join(serverDir, 'server.port.json'));
    await settle();
    expect(fake.lastMenu().items.find((entry) => entry.id === 'status')?.title).toBe('app-core is not running');
    fs.writeFileSync(path.join(serverDir, 'server.port.json'), JSON.stringify({ pid: process.pid, port: 4851 }));
    await settle();
    expect(fake.lastMenu().items.find((entry) => entry.id === 'status')?.title).toContain('4851');
    await companion.stop();
  });

  it('checks for an update, then installs it when asked, then offers a restart', async () => {
    const { companion, fake, calls } = setup();
    await companion.start();
    fake.press('check-update');
    await settle();
    expect(companion.snapshotState().update).toBe('available');
    expect(fake.lastMenu().items.find((entry) => entry.id === 'update-install')?.title).toBe('Update to v2026.10.24-1');
    fake.press('update-install');
    await settle();
    expect(calls.update).toBe(1);
    expect(companion.snapshotState().update).toBe('updated');
    fake.press('restart');
    expect(calls.restart).toBe(1);
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
    expect(fake.lastMenu().items.find((entry) => entry.id === 'check-update')?.enabled).toBe(true);
    fake.press('check-update');
    await settle();
    expect(companion.snapshotState().update).toBe('available');
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
