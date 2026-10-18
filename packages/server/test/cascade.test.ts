import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildServer, type AppCoreServer } from '../src/server.js';
import { fixtureManifest } from './fixtureManifests.js';
import { readModuleLog, resetModuleLog, writeTestModule, type TestModuleSpec } from './moduleFactory.js';

// Decision 93: a provider that goes away, fails or changes incompatibly takes its dependents down with it
// (their teardown runs with reason "dependency"), and they come back by themselves when it is loaded again.

interface Listing {
  modules: Array<{ id: string; version: string }>;
  failed: Array<{ id: string; error: string; cause: string }>;
}

interface Change {
  id?: string;
  version?: string;
  error?: string;
  cascaded: string[];
  recovered: string[];
  retained?: boolean;
}

const SLOT = { slots: { s: { accepts: ['Badge', 'Button'] } } };
const contribution = (slot: string, type = 'Badge') => [{ slot, view: { $type: type, label: 'c' } }];

describe('cascade and auto-recovery between a provider and its dependents', () => {
  let configDir: string;
  let scratch: string;
  let app: AppCoreServer;

  beforeEach(async () => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-cascade-'));
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-cascade-mods-'));
    resetModuleLog();
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    app = await buildServer({ configDir });
  });

  afterEach(async () => {
    await app.server.close();
    vi.restoreAllMocks();
    fs.rmSync(configDir, { recursive: true, force: true });
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  const write = (id: string, spec: TestModuleSpec = {}): string => writeTestModule(scratch, id, { teardown: true, ...spec });

  async function post(action: 'register' | 'update', id: string, manifestPath: string): Promise<{ status: number; body: Change }> {
    const res = await app.server.inject({ method: 'POST', url: `/api/modules/${action}`, payload: { id, source: { type: 'file', path: manifestPath } } });
    return { status: res.statusCode, body: res.json<Change>() };
  }
  async function unregister(id: string): Promise<{ status: number; body: Change }> {
    const res = await app.server.inject({ method: 'POST', url: '/api/modules/unregister', payload: { id } });
    return { status: res.statusCode, body: res.json<Change>() };
  }
  async function listing(): Promise<Listing> {
    return (await app.server.inject({ method: 'GET', url: '/api/modules' })).json<Listing>();
  }
  async function slot(id: string): Promise<unknown[]> {
    return (await app.server.inject({ method: 'GET', url: `/api/slots/${id}` })).json<unknown[]>();
  }
  const loadedIds = (): string[] => app.manager.list().map((m) => m.id).sort();
  const failedOf = (id: string) => app.manager.listFailed().find((f) => f.id === id);
  const teardowns = (): string[] => readModuleLog().filter((l) => l.startsWith('teardown:'));
  const registryFile = (id: string): string => path.join(configDir, 'modules', `${id}.json`);

  // Provider "a" exposing slot "s", contributor "b" filling it.
  async function providerAndContributor(): Promise<{ a: string; b: string }> {
    const a = write('a', { expose: SLOT });
    const b = write('b', { requires: { a: '^1.0.0' }, points: contribution('a:s') });
    expect((await post('register', 'a', a)).status).toBe(201);
    expect((await post('register', 'b', b)).status).toBe(201);
    return { a, b };
  }

  describe('unregister', () => {
    it('unloads the contributor first (reason dependency), records why, keeps its registry entry, stops serving it', async () => {
      await providerAndContributor();
      expect(await slot('a:s')).toHaveLength(1);
      resetModuleLog();

      const res = await unregister('a');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: 'a', removed: true, cascaded: ['b'], recovered: [] });
      expect(teardowns()).toEqual(['teardown:b:dependency', 'teardown:a:unregister']);
      expect(loadedIds()).toEqual([]);
      expect(failedOf('b')).toMatchObject({ cause: 'requirement' });
      expect(failedOf('b')?.error).toMatch(/^required module "a" was unregistered: .*register "a" again/);
      expect(fs.existsSync(registryFile('b'))).toBe(true);
      expect(fs.existsSync(registryFile('a'))).toBe(false);
      expect(await slot('a:s')).toEqual([]);
      const body = await listing();
      expect(body.failed).toEqual([expect.objectContaining({ id: 'b', cause: 'requirement' })]);
    });

    it('registering the provider again recovers the contributor automatically, and it is served again', async () => {
      const { a } = await providerAndContributor();
      await unregister('a');
      resetModuleLog();

      const res = await post('register', 'a', a);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ cascaded: [], recovered: ['b'] });
      expect(loadedIds()).toEqual(['a', 'b']);
      expect(app.manager.listFailed()).toEqual([]);
      expect(readModuleLog()).toEqual(['setup:a', 'setup:b']);
      expect(await slot('a:s')).toHaveLength(1);
    });

    it('a chain c -> b -> a: dependents are torn down before their providers, each failure names its direct provider', async () => {
      const a = write('a');
      await post('register', 'a', a);
      await post('register', 'b', write('b', { requires: { a: '*' } }));
      await post('register', 'c', write('c', { requires: { b: '*' } }));
      resetModuleLog();

      const res = await unregister('a');

      expect(res.body.cascaded).toEqual(['c', 'b']);
      expect(teardowns()).toEqual(['teardown:c:dependency', 'teardown:b:dependency', 'teardown:a:unregister']);
      expect(failedOf('b')?.error).toMatch(/^required module "a" was unregistered:/);
      expect(failedOf('c')?.error).toMatch(/^required module "b" failed: .*required module "a" was unregistered/);

      resetModuleLog();
      const back = await post('register', 'a', a);
      // Topological order: b needs a, c needs b.
      expect(back.body.recovered).toEqual(['b', 'c']);
      expect(readModuleLog()).toEqual(['setup:a', 'setup:b', 'setup:c']);
    });

    it('a diamond d -> (b, c) -> a: every dependent goes before the modules it requires, each module once', async () => {
      const a = write('a');
      await post('register', 'a', a);
      await post('register', 'b', write('b', { requires: { a: '*' } }));
      await post('register', 'c', write('c', { requires: { a: '*' } }));
      await post('register', 'd', write('d', { requires: { b: '*', c: '*' } }));
      resetModuleLog();

      const res = await unregister('a');

      expect([...res.body.cascaded].sort()).toEqual(['b', 'c', 'd']);
      expect(res.body.cascaded[0]).toBe('d');
      const order = teardowns();
      expect(order).toHaveLength(4);
      const at = (id: string): number => order.findIndex((l) => l.startsWith(`teardown:${id}:`));
      expect(at('d')).toBeLessThan(at('b'));
      expect(at('d')).toBeLessThan(at('c'));
      expect(at('b')).toBeLessThan(at('a'));
      expect(at('c')).toBeLessThan(at('a'));

      resetModuleLog();
      const back = await post('register', 'a', a);
      expect(back.body.recovered).toEqual(['b', 'c', 'd']);
    });

    it('does not touch a module that does not require the provider', async () => {
      await providerAndContributor();
      await post('register', 'other', write('other'));
      resetModuleLog();
      await unregister('a');
      expect(loadedIds()).toEqual(['other']);
      expect(teardowns()).not.toContain('teardown:other:dependency');
    });
  });

  describe('update of the provider', () => {
    it('a compatible update leaves the contributor untouched (no teardown, no setup, not listed as cascaded)', async () => {
      const { a } = await providerAndContributor();
      resetModuleLog();

      write('a', { version: '1.1.0', expose: SLOT });
      const res = await post('update', 'a', a);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ version: '1.1.0', cascaded: [], recovered: [] });
      expect(readModuleLog()).toEqual(['teardown:a:update', 'setup:a']);
      expect(loadedIds()).toEqual(['a', 'b']);
      expect(await slot('a:s')).toHaveLength(1);
    });

    it('removing the exposed slot fails the contributor with a precise message; it is no longer served', async () => {
      const { a } = await providerAndContributor();
      resetModuleLog();

      write('a', { version: '1.1.0', expose: { slots: { other: { accepts: ['Badge'] } } } });
      const res = await post('update', 'a', a);

      expect(res.status).toBe(200);
      expect(res.body.cascaded).toEqual(['b']);
      // The provider's own swap is not delayed by the contributor's check: teardown of the old a, setup of the new one, then b.
      expect(readModuleLog()).toEqual(['teardown:a:update', 'setup:a', 'teardown:b:dependency']);
      const failure = failedOf('b');
      expect(failure?.cause).toBe('requirement');
      expect(failure?.error).toContain('"a" was updated');
      expect(failure?.error).toContain('does not expose the slot "s"');
      expect(failure?.error).toContain('Fix:');
      expect(await slot('a:s')).toEqual([]);
    });

    it('narrowing "accepts" fails a contributor whose root $type is no longer accepted, and keeps the others', async () => {
      const { a } = await providerAndContributor();
      await post('register', 'b2', write('b2', { requires: { a: '^1.0.0' }, points: contribution('a:s', 'Badge') }));
      await post('register', 'btn', write('btn', { requires: { a: '^1.0.0' }, points: contribution('a:s', 'Button') }));
      expect(loadedIds()).toEqual(['a', 'b', 'b2', 'btn']);

      write('a', { version: '1.2.0', expose: { slots: { s: { accepts: ['Badge'] } } } });
      const res = await post('update', 'a', a);

      expect(res.body.cascaded).toEqual(['btn']);
      expect(failedOf('btn')?.error).toMatch(/contributes a "Button" to "a:s", which accepts only: Badge/);
      expect(loadedIds()).toEqual(['a', 'b', 'b2']);
    });

    it('a version outside the dependent range fails it; bringing the version back recovers it', async () => {
      const { a } = await providerAndContributor();

      write('a', { version: '2.0.0', expose: SLOT });
      const res = await post('update', 'a', a);
      expect(res.body.cascaded).toEqual(['b']);
      expect(failedOf('b')?.error).toContain('requires "a" "^1.0.0" but version 2.0.0 of "a" is loaded');

      write('a', { version: '1.5.0', expose: SLOT });
      const back = await post('update', 'a', a);
      expect(back.body.recovered).toEqual(['b']);
      expect(loadedIds()).toEqual(['a', 'b']);
    });

    it('an update rejected by the pre-checks keeps the old provider and leaves its dependents untouched', async () => {
      const { a } = await providerAndContributor();
      resetModuleLog();

      fs.writeFileSync(a, JSON.stringify({ id: 'a', version: '9.9.9' }));
      const res = await post('update', 'a', a);

      expect(res.status).toBe(400);
      expect(res.body.cascaded).toEqual([]);
      expect(loadedIds()).toEqual(['a', 'b']);
      expect(readModuleLog()).toEqual([]);
      expect(app.manager.get('a')?.manifest.version).toBe('1.0.0');
    });

    it('an update that fails after the old provider was torn down fails its dependents ("failed"), a fixed update recovers them', async () => {
      const { a } = await providerAndContributor();
      resetModuleLog();

      write('a', { version: '1.1.0', expose: SLOT, backend: "export default function () { throw new Error('boom'); }\n" });
      const res = await post('update', 'a', a);

      expect(res.status).toBe(500);
      expect(res.body.cascaded).toEqual(['b']);
      expect(failedOf('a')?.error).toContain('boom');
      expect(failedOf('b')?.error).toMatch(/^required module "a" failed: /);
      expect(failedOf('b')?.error).toContain('boom');
      expect(await slot('a:s')).toEqual([]);

      write('a', { version: '1.2.0', expose: SLOT });
      const fixed = await post('update', 'a', a);
      expect(fixed.body.recovered).toEqual(['b']);
      expect(loadedIds()).toEqual(['a', 'b']);
    });

    it('an update that makes the provider require its own dependent is refused as a cycle; the old version keeps serving', async () => {
      const { a } = await providerAndContributor();

      write('a', { version: '2.0.0', expose: SLOT, requires: { b: '*' } });
      const res = await post('update', 'a', a);

      expect(res.status).toBe(422);
      expect(res.body.error).toContain('require cycle (a -> b -> a)');
      expect(loadedIds()).toEqual(['a', 'b']);
      expect(app.manager.get('a')?.manifest.version).toBe('1.0.0');
    });
  });

  describe('auto-recovery', () => {
    it('a contributor registered before its provider is retained and loads when the provider is registered', async () => {
      const b = write('b', { requires: { a: '^1.0.0' }, points: contribution('a:s') });
      const first = await post('register', 'b', b);
      expect(first.status).toBe(422);
      expect(first.body.retained).toBe(true);
      expect(first.body.error).toContain('stays registered and failed');
      expect(fs.existsSync(registryFile('b'))).toBe(true);

      const res = await post('register', 'a', write('a', { expose: SLOT }));
      expect(res.body.recovered).toEqual(['b']);
      expect(loadedIds()).toEqual(['a', 'b']);
      expect(await slot('a:s')).toHaveLength(1);
    });

    it('a retry that still fails updates the failed message and does not loop', async () => {
      await post('register', 'b', write('b', { requires: { a: '^1.0.0' } }));
      expect(failedOf('b')?.error).toContain('module "a" is not loaded');

      const res = await post('register', 'a', write('a', { version: '3.0.0' }));

      expect(res.body.recovered).toEqual([]);
      expect(failedOf('b')?.error).toContain('but version 3.0.0 of "a" is loaded');
      expect(failedOf('b')?.cause).toBe('requirement');
    });

    it('does not retry a module whose requirement is still missing, and a failure of another kind is not retried at all', async () => {
      await post('register', 'needs-ghost', write('needs-ghost', { requires: { ghost: '*' } }));
      await post('register', 'broken', write('broken', { backend: "export default function () { throw new Error('nope'); }\n" }));
      expect(failedOf('broken')?.cause).toBe('error');
      resetModuleLog();

      const recovered = await app.manager.recoverFailed();

      expect(recovered).toEqual([]);
      expect(readModuleLog()).toEqual([]);
      expect(failedOf('needs-ghost')?.error).toContain('module "ghost" is not loaded');
    });

    it('recovers a long chain registered in reverse order, in topological order, in one go', async () => {
      await post('register', 'c', write('c', { requires: { b: '*' } }));
      await post('register', 'b', write('b', { requires: { a: '*' } }));
      resetModuleLog();

      const res = await post('register', 'a', write('a'));

      expect(res.body.recovered).toEqual(['b', 'c']);
      expect(readModuleLog()).toEqual(['setup:a', 'setup:b', 'setup:c']);
    });

    it('two modules that require each other stay failed and the recovery terminates', async () => {
      await post('register', 'x', write('x', { requires: { y: '*' } }));
      await post('register', 'y', write('y', { requires: { x: '*' } }));
      expect(await app.manager.recoverFailed()).toEqual([]);
      expect(loadedIds()).toEqual([]);
    });
  });

  describe('real fixtures: slot-provider and its contributors', () => {
    const PROVIDER = 'slot-provider';
    const contributors = ['slot-contributor-a', 'slot-contributor-b'];

    async function registerAll(providerManifest: string): Promise<void> {
      expect((await post('register', PROVIDER, providerManifest)).status).toBe(201);
      for (const id of contributors) {
        expect((await post('register', id, fixtureManifest(`app-module-${id}`))).status).toBe(201);
      }
    }

    // A copy of the packaged provider that a test may edit without touching the built fixture (the folder keeps the name dist-module: vitest loads CJS bundles natively only from such a path).
    function copyProvider(): string {
      const target = path.join(scratch, 'provider-copy', 'dist-module');
      fs.cpSync(path.dirname(fixtureManifest('app-module-slot-provider')), target, { recursive: true });
      return path.join(target, 'manifest.json');
    }
    function editProvider(manifestPath: string, edit: (manifest: Record<string, any>) => void): void {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      edit(manifest);
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }

    it('unregister: contributors fail and /api/slots stops serving them; re-register recovers and serves them again', async () => {
      const provider = fixtureManifest('app-module-slot-provider');
      await registerAll(provider);
      expect(await slot('slot-provider:shared-slot')).toHaveLength(3);

      const gone = await unregister(PROVIDER);
      expect([...gone.body.cascaded].sort()).toEqual(contributors);
      expect(await slot('slot-provider:shared-slot')).toEqual([]);
      expect((await listing()).failed.map((f) => f.id).sort()).toEqual(contributors);

      const back = await post('register', PROVIDER, provider);
      expect([...back.body.recovered].sort()).toEqual(contributors);
      expect(await slot('slot-provider:shared-slot')).toHaveLength(3);
      expect((await listing()).failed).toEqual([]);
    });

    it('update removing the exposed slot fails both contributors with the precise reason', async () => {
      const provider = copyProvider();
      await registerAll(provider);
      editProvider(provider, (m) => {
        m['version'] = '1.1.0';
        delete m['expose'].slots['shared-slot'];
      });

      const res = await post('update', PROVIDER, provider);

      expect([...res.body.cascaded].sort()).toEqual(contributors);
      for (const id of contributors) {
        expect(failedOf(id)?.error).toContain('does not expose the slot "shared-slot"');
        expect(failedOf(id)?.error).toContain('unused-slot');
      }
      expect(await slot('slot-provider:shared-slot')).toEqual([]);
    });

    it('update narrowing accepts fails the contributors; a compatible update leaves them', async () => {
      const provider = copyProvider();
      await registerAll(provider);

      editProvider(provider, (m) => {
        m['version'] = '1.0.1';
        m['expose'].slots['unused-slot'].accepts = ['Badge', 'Button'];
      });
      const compatible = await post('update', PROVIDER, provider);
      expect(compatible.body.cascaded).toEqual([]);
      expect(await slot('slot-provider:shared-slot')).toHaveLength(3);

      editProvider(provider, (m) => {
        m['version'] = '1.0.2';
        m['expose'].slots['shared-slot'].accepts = ['Button'];
      });
      const narrowed = await post('update', PROVIDER, provider);
      expect([...narrowed.body.cascaded].sort()).toEqual(contributors);
      expect(failedOf('slot-contributor-a')?.error).toMatch(/contributes a "Badge" to "slot-provider:shared-slot", which accepts only: Button/);
    });
  });

  describe('shutdown', () => {
    it('runs every teardown with reason "shutdown", dependents first, and records no failure', async () => {
      await providerAndContributor();
      resetModuleLog();

      await app.manager.shutdown();

      expect(teardowns()).toEqual(['teardown:b:shutdown', 'teardown:a:shutdown']);
      expect(app.manager.listFailed()).toEqual([]);
      expect(fs.existsSync(registryFile('b'))).toBe(true);
    });
  });
});
