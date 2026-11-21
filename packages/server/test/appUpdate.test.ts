import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildServer, type AppCoreServer, type BuildServerOptions } from '../src/server.js';
import { setPin } from '../src/auth/pin.js';
import { signAccessToken } from '../src/auth/tokens.js';

const RUNNING = '2026.11.14-193-c7bfd3f7';
const NEWER = '2026.11.20-209-2f19765e';
// 2026-11-20T10:00:00Z: the day of the log file the updater wrote its failure into.
const FAILED_AT = Date.UTC(2026, 10, 20, 10, 0, 0);

describe('GET /api/app-update and POST /api/app-update/restart', () => {
  let root: string;
  let configDir: string;
  let updaterDir: string;
  let packageDir: string;
  let app: AppCoreServer | undefined;

  const writeJson = (file: string, value: unknown): void => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  };
  const state = (value: unknown): void => writeJson(path.join(updaterDir, 'update-state.json'), value);
  const cache = (latestVersion: string | null): void => writeJson(path.join(updaterDir, 'update-cache.json'), { lastCheckedAt: 1, latestVersion });
  const installed = (version: string): void => writeJson(path.join(packageDir, 'package.json'), { name: '@wadeck-app/app-core-cli', version });

  const start = async (update: BuildServerOptions['update'] | undefined = { runningVersion: RUNNING, packageDir, updaterDir }): Promise<AppCoreServer> => {
    app = await buildServer({ configDir, publicDir: path.join(root, 'no-public'), ...(update === undefined ? {} : { update }) });
    return app;
  };
  const get = async (update?: BuildServerOptions['update']) => {
    const built = await start(update);
    const res = await built.server.inject({ method: 'GET', url: '/api/app-update' });
    expect(res.statusCode).toBe(200);
    return res.json() as Record<string, any>;
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-update-'));
    configDir = path.join(root, 'cfg');
    updaterDir = path.join(root, 'cli-config');
    packageDir = path.join(root, 'pkg');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(updaterDir, { recursive: true });
  });
  afterEach(async () => {
    await app?.server.close();
    app = undefined;
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('state', () => {
    it('says it is a run that is not an installed release (dev:all) instead of guessing', async () => {
      const body = await get({ updaterDir });
      expect(body['state']).toBe('unknown');
      expect(body['reason']).toMatch(/not run from an installed app-core-cli/);
      expect(body['canRestart']).toBe(false);
    });

    it('is unknown, naming the folder, when the updater never wrote anything', async () => {
      installed(RUNNING);
      const body = await get();
      expect(body['state']).toBe('unknown');
      expect(body['reason']).toContain(updaterDir);
      expect(body['reason']).toMatch(/update-state\.json/);
    });

    it('is unknown, naming the file, when update-state.json is not JSON', async () => {
      installed(RUNNING);
      state('{ not json');
      const body = await get();
      expect(body['state']).toBe('unknown');
      expect(body['reason']).toContain('update-state.json');
    });

    it('is unknown, naming the file, when the installed package.json cannot be read', async () => {
      state({ status: 'success', currentVersion: RUNNING, timestamp: 1 });
      const body = await get();
      expect(body['state']).toBe('unknown');
      expect(body['reason']).toContain(path.join(packageDir, 'package.json'));
    });

    it('is up-to-date when running, installed and latest are the same', async () => {
      installed(RUNNING);
      state({ status: 'success', currentVersion: RUNNING, timestamp: 1 });
      cache(RUNNING);
      const body = await get();
      expect(body).toMatchObject({ state: 'up-to-date', running: RUNNING, installed: RUNNING, latest: RUNNING });
    });

    it('is restart-needed when the installed version is not the running one, with the previous version', async () => {
      installed(NEWER);
      state({ status: 'success', currentVersion: RUNNING, targetVersion: NEWER, previousVersion: RUNNING, timestamp: 1 });
      cache(NEWER);
      const body = await get();
      expect(body).toMatchObject({ state: 'restart-needed', running: RUNNING, installed: NEWER, latest: NEWER, previousVersion: RUNNING });
    });

    it('is update-failed with the error, and the log file of that day when it exists', async () => {
      installed(RUNNING);
      const logFile = path.join(updaterDir, 'logs', '2026-11-20.ndjson');
      writeJson(logFile, '');
      state({ status: 'failed', currentVersion: RUNNING, targetVersion: NEWER, previousVersion: RUNNING, error: 'health check failed: module "project" does not load', timestamp: FAILED_AT });
      cache(NEWER);
      const body = await get();
      expect(body['state']).toBe('update-failed');
      expect(body['failure']).toEqual({ message: 'health check failed: module "project" does not load', logFile });
    });

    it('is update-failed without a log file when none exists, and for a rolled-back update', async () => {
      installed(RUNNING);
      state({ status: 'rolled-back', currentVersion: RUNNING, targetVersion: NEWER, error: 'self-check failed', timestamp: FAILED_AT });
      cache(NEWER);
      const body = await get();
      expect(body['state']).toBe('update-failed');
      expect(body['failure']).toEqual({ message: 'self-check failed' });
    });

    it('is update-available when the latest known version is not the running one and nothing failed', async () => {
      installed(RUNNING);
      state({ status: 'update-available', currentVersion: RUNNING, targetVersion: NEWER, timestamp: 1 });
      cache(NEWER);
      expect((await get())['state']).toBe('update-available');
    });

    it('is applying while the updater is installing', async () => {
      installed(RUNNING);
      state({ status: 'applying', currentVersion: RUNNING, targetVersion: NEWER, phase: 'staged', pid: 1, timestamp: Date.now() });
      cache(NEWER);
      const body = await get();
      expect(body['state']).toBe('applying');
      expect(body['latest']).toBe(NEWER);
    });

    it('offers the restart only when the server was given a way to restart', async () => {
      installed(RUNNING);
      state({ status: 'success', currentVersion: RUNNING, timestamp: 1 });
      cache(RUNNING);
      expect((await get({ runningVersion: RUNNING, packageDir, updaterDir, restart: () => undefined }))['canRestart']).toBe(true);
    });
  });

  describe('restart', () => {
    const post = (built: AppCoreServer, headers: Record<string, string> = {}) => built.server.inject({ method: 'POST', url: '/api/app-update/restart', payload: {}, headers });

    it('answers 409 and says why when this run cannot restart itself (no PIN asked)', async () => {
      const built = await start({ updaterDir });
      const res = await post(built);
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: 'restart-unavailable' });
      expect((res.json() as { message: string }).message).toMatch(/restart it yourself|app-core-cli serve/);
    });

    it('is sensitive: 403 pin-not-set without a PIN, 401 elevation-required with a PIN but no token', async () => {
      const restart = vi.fn();
      const built = await start({ runningVersion: RUNNING, packageDir, updaterDir, restart });
      expect((await post(built)).statusCode).toBe(403);
      await setPin(configDir, '482915');
      const res = await post(built);
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: 'elevation-required' });
      expect(restart).not.toHaveBeenCalled();
    });

    it('answers 202 and restarts once the answer is sent, with a valid access token', async () => {
      const restart = vi.fn();
      await setPin(configDir, '482915');
      const built = await start({ runningVersion: RUNNING, packageDir, updaterDir, restart });
      const res = await post(built, { authorization: `Bearer ${signAccessToken(configDir)}` });
      expect(res.statusCode).toBe(202);
      expect(res.json()).toEqual({ restarting: true });
      await vi.waitFor(() => expect(restart).toHaveBeenCalledTimes(1));
    });

    it('restarts once even when two requests come: the second is refused with 409 restart-in-progress', async () => {
      const restart = vi.fn();
      await setPin(configDir, '482915');
      const built = await start({ runningVersion: RUNNING, packageDir, updaterDir, restart });
      const headers = { authorization: `Bearer ${signAccessToken(configDir)}` };
      const first = await post(built, headers);
      const second = await post(built, headers);
      expect(first.statusCode).toBe(202);
      expect(second.statusCode).toBe(409);
      expect(second.json()).toMatchObject({ error: 'restart-in-progress' });
      await vi.waitFor(() => expect(restart).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(restart).toHaveBeenCalledTimes(1);
    });

    it('reports a failed restart on the console, with what to do, and accepts a new request afterwards', async () => {
      const restart = vi.fn(() => {
        throw new Error('restart is not ready');
      });
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await setPin(configDir, '482915');
        const built = await start({ runningVersion: RUNNING, packageDir, updaterDir, restart });
        const headers = { authorization: `Bearer ${signAccessToken(configDir)}` };
        expect((await post(built, headers)).statusCode).toBe(202);
        await vi.waitFor(() => expect(consoleError).toHaveBeenCalledTimes(1));
        expect(String(consoleError.mock.calls[0]?.[0])).toMatch(/restart failed: restart is not ready.*restart it by hand/);
        expect((await post(built, headers)).statusCode).toBe(202);
      } finally {
        consoleError.mockRestore();
      }
    });
  });

  describe('a stuck updater', () => {
    it('is unknown, naming the log file, when "applying" is older than 30 minutes', async () => {
      installed(RUNNING);
      const startedAt = Date.UTC(2026, 10, 20, 10, 0, 0);
      const logFile = path.join(updaterDir, 'logs', '2026-11-20.ndjson');
      writeJson(logFile, '');
      state({ status: 'applying', currentVersion: RUNNING, targetVersion: NEWER, phase: 'staged', pid: 1, timestamp: startedAt });
      cache(NEWER);
      const fakeNow = startedAt + 31 * 60_000;
      const built = await buildServer({ configDir, publicDir: path.join(root, 'no-public'), authClock: () => fakeNow, update: { runningVersion: RUNNING, packageDir, updaterDir } });
      app = built;
      const body = (await built.server.inject({ method: 'GET', url: '/api/app-update' })).json() as Record<string, any>;
      expect(body['state']).toBe('unknown');
      expect(body['reason']).toBe(`the updater stopped while applying; see ${logFile}`);
    });

    it('stays applying at 29 minutes', async () => {
      installed(RUNNING);
      const startedAt = Date.UTC(2026, 10, 20, 10, 0, 0);
      state({ status: 'applying', currentVersion: RUNNING, targetVersion: NEWER, phase: 'staged', pid: 1, timestamp: startedAt });
      cache(NEWER);
      const built = await buildServer({ configDir, publicDir: path.join(root, 'no-public'), authClock: () => startedAt + 29 * 60_000, update: { runningVersion: RUNNING, packageDir, updaterDir } });
      app = built;
      expect(((await built.server.inject({ method: 'GET', url: '/api/app-update' })).json() as Record<string, any>)['state']).toBe('applying');
    });
  });
});
