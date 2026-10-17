import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as url from 'node:url';
import { buildServer } from '../src/server.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '..', '..', 'test-app-modules');

type Built = Awaited<ReturnType<typeof buildServer>>;

describe('POST /api/modules/unregister', () => {
  let configDir: string;
  let modulesDir: string;

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-unregister-'));
    modulesDir = path.join(configDir, 'modules');
  });

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  async function register(server: Built['server'], id: string, fixture: string) {
    const res = await server.inject({
      method: 'POST',
      url: '/api/modules/register',
      payload: { id, source: { type: 'file', path: path.join(fixturesDir, fixture, 'manifest.json') } },
    });
    expect(res.statusCode).toBe(201);
  }

  async function unregister(server: Built['server'], payload: unknown) {
    return server.inject({ method: 'POST', url: '/api/modules/unregister', payload: payload as object });
  }

  it('removes the module: routes 404, slot contribution gone, registry file deleted, not back after a restart', async () => {
    const first = await buildServer({ configDir });
    await register(first.server, 'module-c', 'app-module-live-page');
    await register(first.server, 'slot-contributor-a', 'app-module-slot-contributor-a');
    expect((await first.server.inject({ method: 'GET', url: '/api/modules/module-c/greeting' })).statusCode).toBe(200);
    const slotBefore = (await first.server.inject({ method: 'GET', url: '/api/slots/test:shared-slot' })).json() as unknown[];
    expect(slotBefore.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(modulesDir, 'module-c.json'))).toBe(true);

    expect((await unregister(first.server, { id: 'module-c' })).json()).toEqual({ id: 'module-c', removed: true });
    expect((await unregister(first.server, { id: 'slot-contributor-a' })).statusCode).toBe(200);

    expect((await first.server.inject({ method: 'GET', url: '/api/modules/module-c/greeting' })).statusCode).toBe(404);
    expect((await first.server.inject({ method: 'GET', url: '/api/slots/test:shared-slot' })).json()).toEqual([]);
    expect(((await first.server.inject({ method: 'GET', url: '/api/modules' })).json() as { modules: unknown[] }).modules).toEqual([]);
    expect(fs.existsSync(path.join(modulesDir, 'module-c.json'))).toBe(false);
    await first.server.close();

    const second = await buildServer({ configDir });
    expect(second.manager.list()).toEqual([]);
    await second.server.close();
  });

  it('forgets a module that failed to load, including its registry file', async () => {
    const first = await buildServer({ configDir });
    const bad = await first.server.inject({
      method: 'POST',
      url: '/api/modules/register',
      payload: { id: 'broken', source: { type: 'file', path: path.join(configDir, 'nope', 'manifest.json') } },
    });
    expect(bad.statusCode).toBe(500);
    expect(first.manager.hasFailed('broken')).toBe(true);

    expect((await unregister(first.server, { id: 'broken' })).statusCode).toBe(200);
    expect(first.manager.hasFailed('broken')).toBe(false);
    expect(fs.existsSync(path.join(modulesDir, 'broken.json'))).toBe(false);
    await first.server.close();
  });

  it('returns 404 with an actionable message for an unknown id', async () => {
    const { server } = await buildServer({ configDir });
    const res = await unregister(server, { id: 'never-seen' });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toContain('GET /api/modules');
    await server.close();
  });

  it('rejects a path-traversal id with 400 and deletes nothing outside the modules dir', async () => {
    const { server } = await buildServer({ configDir });
    const outside = path.join(configDir, 'x.json');
    fs.writeFileSync(outside, '{}');

    for (const id of ['../x', '..\\x', 'a/b', '.hidden', '']) {
      expect((await unregister(server, { id })).statusCode).toBe(400);
    }
    expect((await unregister(server, {})).statusCode).toBe(400);
    expect(fs.existsSync(outside)).toBe(true);
    await server.close();
  });

  it('register and update reject a path-traversal id too, writing no file', async () => {
    const { server } = await buildServer({ configDir });
    const manifest = path.join(fixturesDir, 'app-module-minimal', 'manifest.json');
    for (const url of ['/api/modules/register', '/api/modules/update']) {
      const res = await server.inject({
        method: 'POST',
        url,
        payload: { id: '../escaped', source: { type: 'file', path: manifest } },
      });
      expect(res.statusCode).toBe(400);
    }
    expect(fs.existsSync(path.join(configDir, 'escaped.json'))).toBe(false);
    await server.close();
  });
});
