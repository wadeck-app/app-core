import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildServer } from '../src/server.js';
import { writeRegistryEntry } from '../src/registry.js';
import { readFixtureBTicks, resetFixtureBTicks } from './fixtureTicks.js';
import { fixtureManifest } from './fixtureManifests.js';


function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('app-core HTTP integration', () => {
  let configDir: string;

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-config-'));
    resetFixtureBTicks();
  });

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  it('POST /api/modules/register loads the module and GET /api/modules reflects it', async () => {
    const { server } = await buildServer({ configDir });
    const manifestPath = fixtureManifest('app-module-minimal');

    const registerRes = await server.inject({
      method: 'POST',
      url: '/api/modules/register',
      payload: { id: 'module-a', source: { type: 'file', path: manifestPath } },
    });
    expect(registerRes.statusCode).toBe(201);
    expect(registerRes.json()).toEqual({ id: 'module-a', version: '1.0.0', extensionPoints: 1, cascaded: [], recovered: [] });

    const listRes = await server.inject({ method: 'GET', url: '/api/modules' });
    expect(listRes.statusCode).toBe(200);
    const body = listRes.json() as { modules: Array<{ id: string }> };
    expect(body.modules.map((m) => m.id)).toEqual(['module-a']);

    await server.close();
  });

  it('rejects an npm source type with 422', async () => {
    const { server } = await buildServer({ configDir });
    const res = await server.inject({
      method: 'POST',
      url: '/api/modules/register',
      payload: { id: 'queue', source: { type: 'npm', package: '@wadeck-app/queue-module', version: '1.0.0' } },
    });
    expect(res.statusCode).toBe(422);
    await server.close();
  });

  it('rejects a malformed payload with 400', async () => {
    const { server } = await buildServer({ configDir });
    const res = await server.inject({ method: 'POST', url: '/api/modules/register', payload: { id: 'queue' } });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toMatch(/^Invalid payload: .*source.*Fix the request body/s);
    await server.close();
  });

  it('picks up a pre-existing registry entry on startup', async () => {
    const manifestPath = fixtureManifest('app-module-minimal');
    writeRegistryEntry(path.join(configDir, 'modules'), { id: 'module-a', source: { type: 'file', path: manifestPath } });

    const { server, manager } = await buildServer({ configDir });
    expect(manager.get('module-a')?.manifest.version).toBe('1.0.0');
    await server.close();
  });

  it('picks up a module registered via the fallback-file path, written directly', async () => {
    // Simulates a daemon that could not reach app-core and wrote the registry
    // file itself instead -- app-core's startup load does not distinguish the
    // two write paths, by design.
    const manifestPath = fixtureManifest('app-module-lifecycle');
    const modulesDir = path.join(configDir, 'modules');
    fs.mkdirSync(modulesDir, { recursive: true });
    fs.writeFileSync(
      path.join(modulesDir, 'module-b.json'),
      JSON.stringify({ id: 'module-b', source: { type: 'file', path: manifestPath } }),
    );

    const { server, manager } = await buildServer({ configDir });
    const loaded = manager.get('module-b');
    expect(loaded?.resolvedViews).toHaveLength(2);
    await wait(20);
    await server.close();
  });

  it('hot-swaps a module via POST /api/modules/update without restarting the server', async () => {
    const { server, manager } = await buildServer({ configDir });
    await server.inject({
      method: 'POST',
      url: '/api/modules/register',
      payload: { id: 'module-b', source: { type: 'file', path: fixtureManifest('app-module-lifecycle') } },
    });
    await wait(20);
    const v1Ticks = readFixtureBTicks().v1;
    expect(v1Ticks).toBeGreaterThan(0);

    const updateRes = await server.inject({
      method: 'POST',
      url: '/api/modules/update',
      payload: { id: 'module-b', source: { type: 'file', path: fixtureManifest('app-module-lifecycle-v2') } },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json()).toMatchObject({ id: 'module-b', version: '2.0.0' });
    expect(manager.get('module-b')?.manifest.version).toBe('2.0.0');

    await wait(20);
    expect(readFixtureBTicks().v2).toBeGreaterThan(0);

    await server.close();
  });

  it('a module-registered route is reachable at /api/modules/<id>/... and gone after unload', async () => {
    const { server, manager } = await buildServer({ configDir });
    await server.inject({
      method: 'POST',
      url: '/api/modules/register',
      payload: { id: 'module-c', source: { type: 'file', path: fixtureManifest('app-module-live-page') } },
    });

    const greetingRes = await server.inject({ method: 'GET', url: '/api/modules/module-c/greeting' });
    expect(greetingRes.statusCode).toBe(200);
    expect(greetingRes.json()).toEqual({ message: 'hello-from-module-c' });

    await manager.unload('module-c');
    const afterUnload = await server.inject({ method: 'GET', url: '/api/modules/module-c/greeting' });
    expect(afterUnload.statusCode).toBe(404);

    await server.close();
  });

  it('does not let one module reach another module\'s registered route', async () => {
    const { server } = await buildServer({ configDir });
    await server.inject({
      method: 'POST',
      url: '/api/modules/register',
      payload: { id: 'module-c', source: { type: 'file', path: fixtureManifest('app-module-live-page') } },
    });

    const wrongId = await server.inject({ method: 'GET', url: '/api/modules/some-other-module/greeting' });
    expect(wrongId.statusCode).toBe(404);

    await server.close();
  });

  it('a widget extensionPoint registers a live route and resolves rawYaml identically to a page', async () => {
    const { server, manager } = await buildServer({ configDir });
    await server.inject({
      method: 'POST',
      url: '/api/modules/register',
      payload: { id: 'module-d', source: { type: 'file', path: fixtureManifest('app-module-live-widget') } },
    });

    const countRes = await server.inject({ method: 'GET', url: '/api/modules/module-d/count' });
    expect(countRes.statusCode).toBe(200);
    expect(countRes.json()).toEqual({ count: 42 });

    const widgetEp = manager.get('module-d')?.resolvedViews.find((v) => v.kind === 'widget');
    expect(widgetEp?.rawYaml).toContain('$sources');
    expect(widgetEp?.rawYaml).toContain('GET /api/modules/module-d/count');

    await manager.unload('module-d');
    const afterUnload = await server.inject({ method: 'GET', url: '/api/modules/module-d/count' });
    expect(afterUnload.statusCode).toBe(404);

    await server.close();
  });
});
