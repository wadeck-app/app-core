import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildServer, type AppCoreServer } from '../src/server.js';
import { cliTokenPath, readCliToken } from '../src/cliToken.js';
import { fixtureManifest } from './fixtureManifests.js';

const PIN = '246810';
// The id the fixture app-module-live-page declares.
const MODULE = 'module-c';
const WARNING = (id: string): string =>
  `module "${id}" registered without the machine token: update its @wadeck-app/app-core-sdk (registerModule sends it since the version that carries cli-token) or its CLI; this will be refused when APP_CORE_REQUIRE_CLI_TOKEN=1`;

describe('the machine token of register, update and unregister', () => {
  let configDir: string;
  let app: AppCoreServer;
  let stderr: string[];

  const start = async (requireCliToken?: boolean): Promise<AppCoreServer> => {
    const built = await buildServer({ configDir, publicDir: path.join(configDir, 'no-public'), ...(requireCliToken === undefined ? {} : { requireCliToken }) });
    app = built;
    return built;
  };
  const token = (): string => fs.readFileSync(cliTokenPath(configDir), 'utf8').trim();
  const send = (action: 'register' | 'update' | 'unregister', id: string, headers: Record<string, string> = {}) =>
    app.server.inject({
      method: 'POST',
      url: `/api/modules/${action}`,
      headers,
      payload: action === 'unregister' ? { id } : { id, source: { type: 'file', path: fixtureManifest('app-module-live-page') } },
    });
  const withToken = (): Record<string, string> => ({ 'x-app-core-token': token() });
  const warnings = (): string[] => stderr.filter((line) => line.includes('registered without the machine token'));
  // The PIN access token a logged-in dashboard holds.
  const pinBearer = async (): Promise<Record<string, string>> => {
    const set = await app.server.inject({ method: 'POST', url: '/api/auth/pin/set', headers: { origin: 'http://127.0.0.1:4850' }, payload: { pin: PIN } });
    expect(set.statusCode).toBe(200);
    return { authorization: `Bearer ${(set.json() as { accessToken: string }).accessToken}` };
  };

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-cli-token-'));
    stderr = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stderr.push(String(chunk));
      return true;
    });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await app.server.close();
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  describe('the token file', () => {
    it('is created at startup: 32 random bytes in hex, kept by the next start', async () => {
      await start();
      expect(token()).toMatch(/^[0-9a-f]{64}$/);
      const first = token();
      await app.server.close();
      await start();
      expect(token()).toBe(first);
    });

    it.skipIf(process.platform === 'win32')('has mode 0600 (not enforced on Windows, where the ACL of the user profile protects it)', async () => {
      await start();
      expect(fs.statSync(cliTokenPath(configDir)).mode & 0o777).toBe(0o600);
    });

    it('is not returned by any route, nor written to the log', async () => {
      await start();
      const secret = token();
      const bodies: string[] = [];
      for (const url of ['/api/modules', '/api/auth/status', '/api/shell-settings', '/api/ab-tests', '/api/modules/cli-token', '/api/cli-token', '/api/auth/cli-token', '/cli-token', '/']) {
        const res = await app.server.inject({ method: 'GET', url });
        bodies.push(`${url} ${res.statusCode} ${res.body} ${JSON.stringify(res.headers)}`);
      }
      bodies.push((await send('register', MODULE, withToken())).body);
      bodies.push((await send('register', MODULE, { 'x-app-core-token': 'wrong' })).body);
      bodies.push(stderr.join(''));
      expect(bodies.filter((body) => body.includes(secret))).toEqual([]);
    });

    it('is refused at startup when it exists but is not a token, naming the file to delete', async () => {
      fs.writeFileSync(cliTokenPath(configDir), 'hello');
      await expect(buildServer({ configDir, publicDir: path.join(configDir, 'no-public') })).rejects.toThrow(/cli-token.*Delete the file/s);
      // Nothing to close: the start failed.
      app = { server: { close: async () => undefined } } as unknown as AppCoreServer;
    });

    it('readCliToken says undefined when there is no file and throws when it cannot be read', () => {
      expect(readCliToken(configDir)).toBeUndefined();
      fs.mkdirSync(cliTokenPath(configDir));
      expect(() => readCliToken(configDir)).toThrow(/cli-token/);
      app = { server: { close: async () => undefined } } as unknown as AppCoreServer;
    });
  });

  describe.each(['register', 'update', 'unregister'] as const)('POST /api/modules/%s, mode warn', (action) => {
    beforeEach(async () => {
      await start();
      if (action !== 'register') {
        expect((await send('register', MODULE, withToken())).statusCode).toBe(201);
        stderr.length = 0;
      }
    });
    const ok = action === 'register' ? 201 : 200;

    it('accepts the right token, with no warning', async () => {
      expect((await send(action, MODULE, withToken())).statusCode).toBe(ok);
      expect(warnings()).toEqual([]);
    });

    it('accepts a request without token and logs ONE warning per module id', async () => {
      expect((await send(action, MODULE)).statusCode).toBe(ok);
      expect(warnings()).toEqual([`[app-core] ${WARNING(MODULE)}\n`]);
      if (action !== 'unregister') {
        expect((await send(action, MODULE)).statusCode).toBe(action === 'register' ? 201 : 200);
        expect(warnings()).toHaveLength(1);
      }
    });

    it('refuses a wrong token with 401 cli-token-invalid, even in warn mode, and changes nothing', async () => {
      const res = await send(action, MODULE, { 'x-app-core-token': 'f'.repeat(64) });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: 'cli-token-invalid' });
      expect(app.manager.get(MODULE) !== undefined).toBe(action !== 'register');
      expect(warnings()).toEqual([]);
    });

    it('accepts a PIN access token (Authorization: Bearer), with no warning', async () => {
      const headers = await pinBearer();
      expect((await send(action, MODULE, headers)).statusCode).toBe(ok);
      expect(warnings()).toEqual([]);
    });

    it('does not accept a Bearer that is not a valid access token: warn mode accepts with the warning', async () => {
      await pinBearer();
      expect((await send(action, MODULE, { authorization: 'Bearer nonsense' })).statusCode).toBe(ok);
      expect(warnings()).toHaveLength(1);
    });
  });

  describe.each(['register', 'update', 'unregister'] as const)('POST /api/modules/%s, mode enforce', (action) => {
    beforeEach(async () => {
      await start(true);
      if (action !== 'register') {
        expect((await send('register', MODULE, withToken())).statusCode).toBe(201);
      }
    });

    it('refuses a request without token with 401 cli-token-required and says what to do', async () => {
      const res = await send(action, MODULE);
      expect(res.statusCode).toBe(401);
      const body = res.json() as { error: string; message: string };
      expect(body.error).toBe('cli-token-required');
      expect(body.message).toContain('registerModule');
      expect(body.message).not.toContain('app-core-cli register');
      expect(body.message).toContain(cliTokenPath(configDir));
      expect(body.message).toContain('X-App-Core-Token');
      expect(app.manager.get(MODULE) !== undefined).toBe(action !== 'register');
    });

    it('accepts the right token and a PIN access token', async () => {
      const ok = action === 'register' ? 201 : 200;
      expect((await send(action, MODULE, withToken())).statusCode).toBe(ok);
      const bearer = await pinBearer();
      if (action === 'unregister') {
        expect((await send('register', MODULE, withToken())).statusCode).toBe(201);
      }
      expect((await send(action, MODULE, bearer)).statusCode).toBe(ok);
    });
  });

  describe('GET /api/auth/status', () => {
    it('says registerProtection warn by default and enforce with requireCliToken', async () => {
      await start();
      expect((await app.server.inject({ method: 'GET', url: '/api/auth/status' })).json()).toMatchObject({ registerProtection: 'warn' });
      await app.server.close();
      await start(true);
      expect((await app.server.inject({ method: 'GET', url: '/api/auth/status' })).json()).toMatchObject({ registerProtection: 'enforce' });
    });

    it('follows APP_CORE_REQUIRE_CLI_TOKEN, and an unknown value is refused at startup', async () => {
      vi.stubEnv('APP_CORE_REQUIRE_CLI_TOKEN', '1');
      await start();
      expect((await app.server.inject({ method: 'GET', url: '/api/auth/status' })).json()).toMatchObject({ registerProtection: 'enforce' });
      await app.server.close();
      vi.stubEnv('APP_CORE_REQUIRE_CLI_TOKEN', 'yes');
      await expect(start()).rejects.toThrow(/APP_CORE_REQUIRE_CLI_TOKEN/);
      app = { server: { close: async () => undefined } } as unknown as AppCoreServer;
      vi.unstubAllEnvs();
    });
  });
});
