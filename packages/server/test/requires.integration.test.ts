import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildServer } from '../src/server.js';
import { writeRegistryEntry } from '../src/registry.js';
import { fixtureManifest } from './fixtureManifests.js';

type Built = Awaited<ReturnType<typeof buildServer>>;

interface FailedBody {
  modules: Array<{ id: string }>;
  failed: Array<{ id: string; error: string }>;
}

describe('requires and exposed slots (decision 82)', () => {
  let configDir: string;
  let scratch: string;
  let stderrLines: string[];

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-requires-'));
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-requires-modules-'));
    stderrLines = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stderrLines.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(configDir, { recursive: true, force: true });
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  // A hand-written packaged module: a manifest with one extension point per given slot and a no-op backend.
  function writeModule(
    id: string,
    extra: {
      version?: string;
      requires?: Record<string, string>;
      expose?: unknown;
      points?: Array<{ slot: string; view: Record<string, unknown> }>;
    } = {},
  ): string {
    const dir = path.join(scratch, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'backend.cjs'), 'module.exports = function () {};\n');
    const points = extra.points ?? [{ slot: 'dashboard', view: { $type: 'Badge', label: id } }];
    const manifest = {
      id,
      version: extra.version ?? '1.0.0',
      backendEntryPath: './backend.cjs',
      ...(extra.requires === undefined ? {} : { requires: extra.requires }),
      ...(extra.expose === undefined ? {} : { expose: extra.expose }),
      extensionPoints: points.map((p) => ({ kind: 'widget', slot: p.slot, view: { type: 'inline', value: p.view } })),
    };
    const manifestPath = path.join(dir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    return manifestPath;
  }

  function register(server: Built['server'], id: string, manifestPath: string) {
    return server.inject({ method: 'POST', url: '/api/modules/register', payload: { id, source: { type: 'file', path: manifestPath } } });
  }

  async function listing(server: Built['server']): Promise<FailedBody> {
    return (await server.inject({ method: 'GET', url: '/api/modules' })).json() as FailedBody;
  }

  describe('real fixtures: provider and contributors', () => {
    it('serves the contributions on /api/slots/slot-provider:shared-slot, sorted by order', async () => {
      const { server } = await buildServer({ configDir });
      expect((await register(server, 'slot-provider', fixtureManifest('app-module-slot-provider'))).statusCode).toBe(201);
      expect((await register(server, 'slot-contributor-a', fixtureManifest('app-module-slot-contributor-a'))).statusCode).toBe(201);
      expect((await register(server, 'slot-contributor-b', fixtureManifest('app-module-slot-contributor-b'))).statusCode).toBe(201);

      const res = await server.inject({ method: 'GET', url: '/api/slots/slot-provider:shared-slot' });
      expect(res.json()).toEqual([
        { $type: 'Badge', label: 'contributor-b-ordered' },
        { $type: 'Badge', label: 'contributor-a' },
        { $type: 'Badge', label: 'contributor-b-unordered' },
      ]);
      await server.close();
    });

    it('rejects a contributor registered before its provider (422) with the fix, and records it as failed', async () => {
      const { server, manager } = await buildServer({ configDir });
      const res = await register(server, 'slot-contributor-a', fixtureManifest('app-module-slot-contributor-a'));
      expect(res.statusCode).toBe(422);
      const error = (res.json() as { error: string }).error;
      expect(error).toContain('module "slot-contributor-a" cannot load');
      expect(error).toContain('requires "slot-provider" "^1.0.0": module "slot-provider" is not loaded');
      expect(error).toContain('Fix: Register "slot-provider" first');
      expect(manager.hasFailed('slot-contributor-a')).toBe(true);
      expect((await server.inject({ method: 'GET', url: '/api/slots/slot-provider:shared-slot' })).json()).toEqual([]);
      await server.close();
    });

    it('at startup loads the provider before the contributors although their registry files sort first', async () => {
      const modulesDir = path.join(configDir, 'modules');
      // readRegistryEntries lists files alphabetically: slot-contributor-* come before slot-provider.
      writeRegistryEntry(modulesDir, { id: 'slot-contributor-a', source: { type: 'file', path: fixtureManifest('app-module-slot-contributor-a') } });
      writeRegistryEntry(modulesDir, { id: 'slot-contributor-b', source: { type: 'file', path: fixtureManifest('app-module-slot-contributor-b') } });
      writeRegistryEntry(modulesDir, { id: 'slot-provider', source: { type: 'file', path: fixtureManifest('app-module-slot-provider') } });

      const { server, manager } = await buildServer({ configDir });
      expect(manager.listFailed()).toEqual([]);
      expect(manager.list().map((m) => m.id)).toEqual(['slot-provider', 'slot-contributor-a', 'slot-contributor-b']);
      expect((await server.inject({ method: 'GET', url: '/api/slots/slot-provider:shared-slot' })).json()).toHaveLength(3);
      await server.close();
    });
  });

  describe('failures', () => {
    it('rejects a provider version outside the required range, naming both versions and the fix', async () => {
      const { server } = await buildServer({ configDir });
      await register(server, 'prov', writeModule('prov', { version: '1.4.0', expose: { slots: { s: { accepts: ['Badge'] } } } }));
      const res = await register(server, 'needs-v2', writeModule('needs-v2', { requires: { prov: '^2.0.0' } }));
      expect(res.statusCode).toBe(422);
      const error = (res.json() as { error: string }).error;
      expect(error).toContain('requires "prov" "^2.0.0" but version 1.4.0 of "prov" is loaded');
      expect(error).toMatch(/Fix: Register a version of "prov" that satisfies \^2\.0\.0/);
      await server.close();
    });

    it('accepts a provider whose version satisfies the range', async () => {
      const { server } = await buildServer({ configDir });
      await register(server, 'prov', writeModule('prov', { version: '2.3.1' }));
      expect((await register(server, 'needs-v2', writeModule('needs-v2', { requires: { prov: '^2.0.0' } }))).statusCode).toBe(201);
      await server.close();
    });

    it('rejects a contribution to a slot the provider does not expose', async () => {
      const { server } = await buildServer({ configDir });
      await register(server, 'prov', writeModule('prov', { expose: { slots: { s: { accepts: ['Badge'] } } } }));
      const res = await register(
        server,
        'c',
        writeModule('c', { requires: { prov: '*' }, points: [{ slot: 'prov:other', view: { $type: 'Badge', label: 'x' } }] }),
      );
      expect(res.statusCode).toBe(422);
      const error = (res.json() as { error: string }).error;
      expect(error).toContain('does not expose the slot "other"');
      expect(error).toContain('prov:s');
      await server.close();
    });

    it('rejects a root $type the slot does not accept, and the contribution is not served', async () => {
      const { server } = await buildServer({ configDir });
      await register(server, 'prov', writeModule('prov', { expose: { slots: { s: { accepts: ['Badge'] } } } }));
      const res = await register(
        server,
        'c',
        writeModule('c', { requires: { prov: '*' }, points: [{ slot: 'prov:s', view: { $type: 'Form', children: [{ $type: 'Badge' }] } }] }),
      );
      expect(res.statusCode).toBe(422);
      expect((res.json() as { error: string }).error).toMatch(/contributes a "Form" to "prov:s", which accepts only: Badge[\s\S]*Fix:/);
      expect((await server.inject({ method: 'GET', url: '/api/slots/prov:s' })).json()).toEqual([]);
      const body = await listing(server);
      expect(body.failed.map((f) => f.id)).toEqual(['c']);
      await server.close();
    });

    it('rejects a contribution to a custom slot without requires', async () => {
      const { server } = await buildServer({ configDir });
      await register(server, 'prov', writeModule('prov', { expose: { slots: { s: { accepts: ['Badge'] } } } }));
      const res = await register(server, 'c', writeModule('c', { points: [{ slot: 'prov:s', view: { $type: 'Badge' } }] }));
      expect(res.statusCode).toBe(422);
      expect((res.json() as { error: string }).error).toContain('"requires" does not list "prov"');
      await server.close();
    });

    it('rejects an unprefixed custom slot at load (manifest validation)', async () => {
      const { server } = await buildServer({ configDir });
      const res = await register(server, 'c', writeModule('c', { points: [{ slot: 'shared-slot', view: { $type: 'Badge' } }] }));
      expect(res.statusCode).toBe(400);
      expect(JSON.stringify(res.json())).toMatch(/shared-slot.*<providerId>:<slot>/s);
      await server.close();
    });

    it('a module may fill its own exposed slot, subject to the same $type rule', async () => {
      const { server } = await buildServer({ configDir });
      const expose = { slots: { s: { accepts: ['Badge'] } } };
      expect((await register(server, 'self', writeModule('self', { expose, points: [{ slot: 'self:s', view: { $type: 'Badge', label: 'ok' } }] }))).statusCode).toBe(201);
      expect((await register(server, 'self2', writeModule('self2', { expose: { slots: { s: { accepts: ['Badge'] } } }, points: [{ slot: 'self2:s', view: { $type: 'Form' } }] }))).statusCode).toBe(422);
      await server.close();
    });
  });

  describe('startup order and cycles', () => {
    it('orders a chain a -> b -> c (a requires b requires c) whatever the registry order', async () => {
      const modulesDir = path.join(configDir, 'modules');
      writeRegistryEntry(modulesDir, { id: 'a', source: { type: 'file', path: writeModule('a', { requires: { b: '*' } }) } });
      writeRegistryEntry(modulesDir, { id: 'b', source: { type: 'file', path: writeModule('b', { requires: { c: '*' } }) } });
      writeRegistryEntry(modulesDir, { id: 'c', source: { type: 'file', path: writeModule('c') } });
      const { manager } = await buildServer({ configDir });
      expect(manager.listFailed()).toEqual([]);
      expect(manager.list().map((m) => m.id)).toEqual(['c', 'b', 'a']);
    });

    it('sends the members of a require cycle to failed with the cycle and the fix, and loads the others', async () => {
      const modulesDir = path.join(configDir, 'modules');
      writeRegistryEntry(modulesDir, { id: 'x', source: { type: 'file', path: writeModule('x', { requires: { y: '*' } }) } });
      writeRegistryEntry(modulesDir, { id: 'y', source: { type: 'file', path: writeModule('y', { requires: { x: '*' } }) } });
      writeRegistryEntry(modulesDir, { id: 'z', source: { type: 'file', path: writeModule('z') } });
      writeRegistryEntry(modulesDir, { id: 'w', source: { type: 'file', path: writeModule('w', { requires: { x: '*' } }) } });

      const { server, manager } = await buildServer({ configDir });
      expect(manager.list().map((m) => m.id)).toEqual(['z']);
      const failed = Object.fromEntries(manager.listFailed().map((f) => [f.id, f.error]));
      expect(Object.keys(failed).sort()).toEqual(['w', 'x', 'y']);
      expect(failed['x']).toContain('require cycle (x -> y -> x)');
      expect(failed['y']).toContain('require cycle (y -> x -> y)');
      expect(failed['x']).toMatch(/Fix: remove one of the "requires"/);
      // A dependent of the cycle fails with the failure of its provider.
      expect(failed['w']).toContain('module "x" failed to load');
      expect(stderrLines.join('')).toContain('require cycle (x -> y -> x)');
      expect((await listing(server)).failed).toHaveLength(3);
      await server.close();
    });

    it('names a required module that failed to load in the dependent error', async () => {
      const modulesDir = path.join(configDir, 'modules');
      writeRegistryEntry(modulesDir, { id: 'dep', source: { type: 'file', path: path.join(scratch, 'missing', 'manifest.json') } });
      writeRegistryEntry(modulesDir, { id: 'user', source: { type: 'file', path: writeModule('user', { requires: { dep: '*' } }) } });
      const { manager } = await buildServer({ configDir });
      const failed = Object.fromEntries(manager.listFailed().map((f) => [f.id, f.error]));
      expect(failed['user']).toContain('module "dep" failed to load');
      expect(failed['user']).toContain('Fix: Fix "dep" first');
    });
  });

  describe('providers that disappear', () => {
    it('a contributor fails when its provider is unregistered, stays failed across a restart, and loads when the provider is back', async () => {
      const first = await buildServer({ configDir });
      await register(first.server, 'slot-provider', fixtureManifest('app-module-slot-provider'));
      await register(first.server, 'slot-contributor-a', fixtureManifest('app-module-slot-contributor-a'));
      await first.server.inject({ method: 'POST', url: '/api/modules/unregister', payload: { id: 'slot-provider' } });

      expect(first.manager.get('slot-contributor-a')).toBeUndefined();
      expect((await first.server.inject({ method: 'GET', url: '/api/slots/slot-provider:shared-slot' })).json()).toEqual([]);
      await first.server.close();

      const second = await buildServer({ configDir });
      expect(second.manager.get('slot-contributor-a')).toBeUndefined();
      expect(second.manager.listFailed().map((f) => f.id)).toEqual(['slot-contributor-a']);
      const back = await register(second.server, 'slot-provider', fixtureManifest('app-module-slot-provider'));
      expect(back.json()).toMatchObject({ recovered: ['slot-contributor-a'] });
      expect(second.manager.get('slot-contributor-a')).toBeDefined();
      await second.server.close();
    });
  });
});
