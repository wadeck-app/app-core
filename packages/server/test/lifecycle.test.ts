import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ModuleManager } from '../src/loader.js';
import { buildServer } from '../src/server.js';
import { startServer } from '../src/start.js';
import { fixtureManifest } from './fixtureManifests.js';
import { readLifecycleLog, resetLifecycleLog } from './fixtureLifecycleLog.js';

let configDir: string;

beforeEach(() => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-lifecycle-'));
  resetLifecycleLog();
});

afterEach(() => {
  fs.rmSync(configDir, { recursive: true, force: true });
});

const lifecycleEntry = (fixture: string) => ({ id: 'module-b', source: { type: 'file' as const, path: fixtureManifest(fixture) } });
const statePath = (id = 'module-b') => path.join(configDir, 'state', `${id}.json`);
const dataDirOf = (id = 'module-b') => path.join(configDir, 'data', id);
const readState = (id = 'module-b') => JSON.parse(fs.readFileSync(statePath(id), 'utf8')) as { version: string };

// Events of the call log as "event:tag", e.g. "teardown:v1".
const events = () => readLifecycleLog().map((e) => `${e.event}:${e.tag}`);

describe('lifecycle hooks with the real packaged fixtures', () => {
  it('first load: creates dataDir, runs setup only (no migrate, previousVersion null), then persists the version', async () => {
    const manager = new ModuleManager({ configDir });
    const loaded = await manager.loadFromEntry(lifecycleEntry('app-module-lifecycle'));

    expect(events()).toEqual(['setup:v1']);
    expect(readLifecycleLog()[0]?.dataDir).toBe(dataDirOf());
    expect(fs.statSync(dataDirOf()).isDirectory()).toBe(true);
    expect(loaded.dataDir).toBe(dataDirOf());
    expect(loaded.moduleContext.dataDir).toBe(dataDirOf());
    expect(loaded.hookContext).toEqual({ id: 'module-b', version: '1.0.0', previousVersion: null, dataDir: dataDirOf() });
    expect(readState()).toEqual({ version: '1.0.0' });
    await manager.shutdown();
  });

  it('update: teardown(old) -> migrate(new) -> setup(new), with the right contexts, then the new version is persisted', async () => {
    const manager = new ModuleManager({ configDir });
    await manager.loadFromEntry(lifecycleEntry('app-module-lifecycle'));
    await manager.loadFromEntry(lifecycleEntry('app-module-lifecycle-v2'));

    expect(events()).toEqual(['setup:v1', 'teardown:v1', 'migrate:v2', 'setup:v2']);
    const [, teardown, migrate] = readLifecycleLog();
    expect(teardown).toMatchObject({ id: 'module-b', version: '1.0.0', previousVersion: null, dataDir: dataDirOf() });
    expect(migrate).toMatchObject({ id: 'module-b', version: '2.0.0', previousVersion: '1.0.0', dataDir: dataDirOf() });
    expect(readState()).toEqual({ version: '2.0.0' });
    await manager.shutdown();
  });

  it('reloading the same version runs teardown and setup but no migrate', async () => {
    const manager = new ModuleManager({ configDir });
    await manager.loadFromEntry(lifecycleEntry('app-module-lifecycle'));
    await manager.loadFromEntry(lifecycleEntry('app-module-lifecycle'));

    expect(events()).toEqual(['setup:v1', 'teardown:v1', 'setup:v1']);
    await manager.shutdown();
  });

  it('a server restart is not an update: the persisted version equals the loaded one, so migrate does not run', async () => {
    const first = new ModuleManager({ configDir });
    await first.loadFromEntry(lifecycleEntry('app-module-lifecycle-v2'));
    await first.shutdown();
    resetLifecycleLog();

    const second = new ModuleManager({ configDir });
    const loaded = await second.loadFromEntry(lifecycleEntry('app-module-lifecycle-v2'));
    expect(events()).toEqual(['setup:v2']);
    expect(loaded.hookContext.previousVersion).toBe('2.0.0');
    await second.shutdown();
  });

  it('a downgrade after a restart passes the persisted version as previousVersion to migrate', async () => {
    const first = new ModuleManager({ configDir });
    await first.loadFromEntry(lifecycleEntry('app-module-lifecycle-v2'));
    await first.shutdown();
    resetLifecycleLog();

    const second = new ModuleManager({ configDir });
    await second.loadFromEntry(lifecycleEntry('app-module-lifecycle'));
    expect(events()).toEqual(['migrate:v1', 'setup:v1']);
    expect(readLifecycleLog()[0]).toMatchObject({ version: '1.0.0', previousVersion: '2.0.0' });
    await second.shutdown();
  });

  it('unload runs teardown once with the context the instance was loaded with, disposes it and keeps state and data', async () => {
    const manager = new ModuleManager({ configDir });
    await manager.loadFromEntry(lifecycleEntry('app-module-lifecycle'));
    fs.writeFileSync(path.join(dataDirOf(), 'user-data.txt'), 'keep me');

    await manager.unload('module-b');
    await manager.unload('module-b');

    expect(events()).toEqual(['setup:v1', 'teardown:v1']);
    expect(readLifecycleLog()[1]).toMatchObject({ id: 'module-b', version: '1.0.0', previousVersion: null, dataDir: dataDirOf() });
    expect(manager.get('module-b')).toBeUndefined();
    expect(readState()).toEqual({ version: '1.0.0' });
    expect(fs.readFileSync(path.join(dataDirOf(), 'user-data.txt'), 'utf8')).toBe('keep me');
  });

  it('forget (unregister) runs teardown once, clears the persisted version but never deletes dataDir; a reinstall is a first install', async () => {
    const manager = new ModuleManager({ configDir });
    await manager.loadFromEntry(lifecycleEntry('app-module-lifecycle'));
    fs.writeFileSync(path.join(dataDirOf(), 'user-data.txt'), 'keep me');

    expect(await manager.forget('module-b')).toBe(true);

    expect(events()).toEqual(['setup:v1', 'teardown:v1']);
    expect(fs.existsSync(statePath())).toBe(false);
    expect(fs.readFileSync(path.join(dataDirOf(), 'user-data.txt'), 'utf8')).toBe('keep me');

    const loaded = await manager.loadFromEntry(lifecycleEntry('app-module-lifecycle-v2'));
    expect(loaded.hookContext.previousVersion).toBeNull();
    expect(events()).toEqual(['setup:v1', 'teardown:v1', 'setup:v2']);
    await manager.shutdown();
  });

  it('shutdown runs teardown once per loaded module and is idempotent', async () => {
    const manager = new ModuleManager({ configDir });
    await manager.loadFromEntry({ id: 'module-a', source: { type: 'file', path: fixtureManifest('app-module-minimal') } });
    await manager.loadFromEntry(lifecycleEntry('app-module-lifecycle'));

    await manager.shutdown();
    await manager.shutdown();

    expect(events()).toEqual(['setup:v1', 'teardown:v1']);
    expect(manager.list()).toEqual([]);
    // A restart is not an unregister: the version stays.
    expect(readState()).toEqual({ version: '1.0.0' });
  });

  it('server.close() (any close path) runs the teardown of every loaded module', async () => {
    const { server, manager } = await buildServer({ configDir });
    await manager.loadFromEntry(lifecycleEntry('app-module-lifecycle'));

    await server.close();

    expect(events()).toEqual(['setup:v1', 'teardown:v1']);
  });

  it('startServer().stop() runs the teardown of every loaded module before closing', async () => {
    // Port 0 is not accepted by APP_CORE_PORT; pick a free one first.
    const probe = await buildServer({ configDir: path.join(configDir, 'probe') });
    await probe.server.listen({ port: 0, host: '127.0.0.1' });
    const address = probe.server.server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    await probe.server.close();

    vi.stubEnv('APP_CORE_PORT', String(port));
    try {
      const running = await startServer({ configDir });
      const registered = await fetch(`http://127.0.0.1:${running.port}/api/modules/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(lifecycleEntry('app-module-lifecycle')),
      });
      expect(registered.status).toBe(201);
      expect(events()).toEqual(['setup:v1']);

      await running.stop();

      expect(events()).toEqual(['setup:v1', 'teardown:v1']);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('POST /api/modules/unregister runs the teardown and clears the persisted version', async () => {
    const { server } = await buildServer({ configDir });
    const body = lifecycleEntry('app-module-lifecycle');
    expect((await server.inject({ method: 'POST', url: '/api/modules/register', payload: body })).statusCode).toBe(201);

    const res = await server.inject({ method: 'POST', url: '/api/modules/unregister', payload: { id: 'module-b' } });

    expect(res.statusCode).toBe(200);
    expect(events()).toEqual(['setup:v1', 'teardown:v1']);
    expect(fs.existsSync(statePath())).toBe(false);
    await server.close();
  });
});

// Hand-written modules (the same approach as updateSafety.test.ts) for the failure paths the fixtures cannot express.
describe('failure handling', () => {
  let dir: string;

  interface Spec {
    version?: string;
    backend?: string;
    teardown?: string;
    migrate?: string;
  }

  // Every hook appends "<name>:<version>" to globalThis.__lc, so the order is observable.
  const log = (): string[] => ((globalThis as { __lc?: string[] }).__lc ??= []);
  const mark = (name: string) => `(globalThis.__lc ??= []).push('${name}');`;

  function writeModule(spec: Spec): { id: string; source: { type: 'file'; path: string } } {
    const version = spec.version ?? '1.0.0';
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({
        id: 'hooked',
        version,
        backendEntryPath: './backend.mjs',
        ...(spec.teardown === undefined && spec.migrate === undefined
          ? {}
          : {
              lifecycle: {
                ...(spec.teardown === undefined ? {} : { teardown: './teardown.mjs' }),
                ...(spec.migrate === undefined ? {} : { migrate: './migrate.mjs' }),
              },
            }),
        extensionPoints: [{ kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: { $type: 'Badge', label: 'x' } } }],
      }),
    );
    fs.writeFileSync(path.join(dir, 'backend.mjs'), spec.backend ?? `export default function (ctx) { ${mark(`setup:${version}`)} ctx.registerRoute('GET', '/ping', (req, reply) => reply.send({ v: '${version}' })); }\n`);
    if (spec.teardown !== undefined) {
      fs.writeFileSync(path.join(dir, 'teardown.mjs'), spec.teardown);
    }
    if (spec.migrate !== undefined) {
      fs.writeFileSync(path.join(dir, 'migrate.mjs'), spec.migrate);
    }
    return { id: 'hooked', source: { type: 'file', path: path.join(dir, 'manifest.json') } };
  }

  // A hook file that logs "<name>:<ctx.version>".
  const hook = (name: string) => 'export default async function (ctx) { (globalThis.__lc ??= []).push(`' + name + ':${ctx.version}`); }\n';
  const routeAnswers = (manager: ModuleManager) => manager.routeRegistry.find('hooked', 'GET', '/ping') !== undefined;
  const stateOf = () => JSON.parse(fs.readFileSync(path.join(configDir, 'state', 'hooked.json'), 'utf8')) as { version: string };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-hooked-'));
    (globalThis as { __lc?: string[] }).__lc = [];
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('a backend import that throws keeps the old instance serving, runs no teardown and keeps the persisted version', async () => {
    const manager = new ModuleManager({ configDir });
    await manager.loadFromEntry(writeModule({ teardown: hook('teardown') }));

    const entry = writeModule({ version: '2.0.0', backend: "throw new Error('import exploded');\n", teardown: hook('teardown') });
    await expect(manager.loadFromEntry(entry)).rejects.toThrow(/import exploded/);

    expect(manager.get('hooked')?.manifest.version).toBe('1.0.0');
    expect(routeAnswers(manager)).toBe(true);
    expect(log()).toEqual(['setup:1.0.0']);
    expect(stateOf()).toEqual({ version: '1.0.0' });
    expect(manager.listFailed()[0]?.error).toMatch(/cannot import the backend .*backend\.mjs.*import exploded.*keeps serving/s);
    await manager.shutdown();
    expect(log()).toEqual(['setup:1.0.0', 'teardown:1.0.0']);
  });

  it('a hook file without a function default export fails before anything is replaced', async () => {
    const manager = new ModuleManager({ configDir });
    await manager.loadFromEntry(writeModule({ teardown: hook('teardown') }));

    const entry = writeModule({ version: '2.0.0', migrate: 'export const nope = 1;\n' });
    await expect(manager.loadFromEntry(entry)).rejects.toThrow(/the migrate hook .*migrate\.mjs.*lifecycle\.migrate.*must default-export a function/s);

    expect(manager.get('hooked')?.manifest.version).toBe('1.0.0');
    expect(routeAnswers(manager)).toBe(true);
    await manager.shutdown();
  });

  it('a declared hook file that is missing fails before anything is replaced, naming the field and the fix', async () => {
    const manager = new ModuleManager({ configDir });
    await manager.loadFromEntry(writeModule({}));

    const entry = writeModule({ version: '2.0.0', migrate: hook('migrate') });
    fs.rmSync(path.join(dir, 'migrate.mjs'));
    await expect(manager.loadFromEntry(entry)).rejects.toThrow(/migrate\.mjs.*lifecycle\.migrate.*does not exist.*app-core-cli package/s);

    expect(manager.get('hooked')?.manifest.version).toBe('1.0.0');
    await manager.shutdown();
  });

  it('a setup that throws after registering a route leaves no orphan route and lands in failed (first load)', async () => {
    const manager = new ModuleManager({ configDir });
    const entry = writeModule({
      backend: "export default function (ctx) { ctx.registerRoute('GET', '/ping', (req, reply) => reply.send({})); ctx.setInterval(() => {}, 1000); throw new Error('setup exploded'); }\n",
    });

    await expect(manager.loadFromEntry(entry)).rejects.toThrow(/module "hooked": setup .*backend\.mjs.*failed: setup exploded/s);

    expect(routeAnswers(manager)).toBe(false);
    expect(manager.get('hooked')).toBeUndefined();
    expect(manager.listFailed().map((f) => f.id)).toEqual(['hooked']);
    expect(manager.listFailed()[0]?.error).toContain('Fix the backend');
    expect(fs.existsSync(path.join(configDir, 'state', 'hooked.json'))).toBe(false);
  });

  it('a setup that throws on update: teardown ran, the old instance is not restored, no orphan route, state keeps the last good version', async () => {
    const manager = new ModuleManager({ configDir });
    await manager.loadFromEntry(writeModule({ teardown: hook('teardown'), migrate: hook('migrate') }));

    const entry = writeModule({
      version: '2.0.0',
      teardown: hook('teardown'),
      migrate: hook('migrate'),
      backend: `export default function (ctx) { ${mark('setup:2.0.0')} ctx.registerRoute('GET', '/ping', (req, reply) => reply.send({})); throw new Error('v2 setup exploded'); }\n`,
    });
    await expect(manager.loadFromEntry(entry)).rejects.toThrow(/setup .*failed: v2 setup exploded\. The previous version \(1\.0\.0\) was already torn down and is not restored/);

    expect(log()).toEqual(['setup:1.0.0', 'teardown:1.0.0', 'migrate:2.0.0', 'setup:2.0.0']);
    expect(manager.get('hooked')).toBeUndefined();
    expect(routeAnswers(manager)).toBe(false);
    expect(manager.listFailed().map((f) => f.id)).toEqual(['hooked']);
    expect(stateOf()).toEqual({ version: '1.0.0' });
  });

  it('a migrate that throws: the new setup does not run, the module is failed, state is unchanged and the next load migrates again', async () => {
    const manager = new ModuleManager({ configDir });
    await manager.loadFromEntry(writeModule({ teardown: hook('teardown') }));

    const broken = writeModule({ version: '2.0.0', teardown: hook('teardown'), migrate: "export default function () { throw new Error('migrate exploded'); }\n" });
    await expect(manager.loadFromEntry(broken)).rejects.toThrow(/migrate \(.*\) from 1\.0\.0 to 2\.0\.0 failed: migrate exploded\. The previous version \(1\.0\.0\) was already torn down.*safe to run twice/s);

    expect(log()).toEqual(['setup:1.0.0', 'teardown:1.0.0']);
    expect(manager.get('hooked')).toBeUndefined();
    expect(routeAnswers(manager)).toBe(false);
    expect(stateOf()).toEqual({ version: '1.0.0' });

    const fixed = writeModule({ version: '2.0.0', migrate: hook('migrate') });
    await manager.loadFromEntry(fixed);
    expect(log()).toEqual(['setup:1.0.0', 'teardown:1.0.0', 'migrate:2.0.0', 'setup:2.0.0']);
    expect(manager.listFailed()).toEqual([]);
    expect(stateOf()).toEqual({ version: '2.0.0' });
    await manager.shutdown();
  });

  it('a teardown that throws is logged (module id, hook, message) and never blocks the update or the unload', async () => {
    const warnings: string[] = [];
    const manager = new ModuleManager({ configDir, onWarning: (m) => warnings.push(m) });
    await manager.loadFromEntry(writeModule({ teardown: "export default function () { throw new Error('teardown exploded'); }\n" }));

    await manager.loadFromEntry(writeModule({ version: '2.0.0', teardown: "export default function () { throw new Error('teardown exploded'); }\n" }));
    expect(manager.get('hooked')?.manifest.version).toBe('2.0.0');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/module "hooked": teardown of version 1\.0\.0 failed.*teardown exploded/);

    await manager.unload('hooked');
    expect(manager.get('hooked')).toBeUndefined();
    expect(warnings).toHaveLength(2);
    expect(routeAnswers(manager)).toBe(false);
  });

  it('teardown failures go to stderr by default', async () => {
    const written: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    });
    try {
      const manager = new ModuleManager({ configDir });
      await manager.loadFromEntry(writeModule({ teardown: "export default function () { throw new Error('boom on stderr'); }\n" }));
      await manager.shutdown();
    } finally {
      spy.mockRestore();
    }
    expect(written.join('')).toMatch(/\[app-core\] module "hooked": teardown of version 1\.0\.0 failed.*boom on stderr/);
  });

  describe('timeouts', () => {
    // The import of the hook or backend file runs under the same timeout as the step that hangs: at 50 ms a busy machine made
    // the import expire first ("cannot import the backend ... timed out" instead of the expected setup message).
    const hang = 'export default function () { return new Promise(() => {}); }\n';

    it('a hanging teardown is reported with the module id and hook, and the unload still completes', async () => {
      const warnings: string[] = [];
      const manager = new ModuleManager({ configDir, hookTimeoutMs: 300, onWarning: (m) => warnings.push(m) });
      await manager.loadFromEntry(writeModule({ teardown: hang }));

      await manager.unload('hooked');

      expect(manager.get('hooked')).toBeUndefined();
      expect(routeAnswers(manager)).toBe(false);
      expect(warnings[0]).toMatch(/module "hooked": teardown of version 1\.0\.0 failed.*timed out after 300 ms.*cannot be cancelled.*APP_CORE_HOOK_TIMEOUT_MS/);
    });

    it('a hanging migrate fails the module with the hook name and the timeout', async () => {
      const manager = new ModuleManager({ configDir, hookTimeoutMs: 300 });
      await manager.loadFromEntry(writeModule({}));

      await expect(manager.loadFromEntry(writeModule({ version: '2.0.0', migrate: hang }))).rejects.toThrow(/module "hooked": migrate .*failed: timed out after 300 ms/);

      expect(manager.get('hooked')).toBeUndefined();
      expect(stateOf()).toEqual({ version: '1.0.0' });
    });

    it('a hanging setup fails the module, disposes its context and records nothing', async () => {
      const manager = new ModuleManager({ configDir, hookTimeoutMs: 300 });
      const entry = writeModule({ backend: "export default function (ctx) { ctx.registerRoute('GET', '/ping', (req, reply) => reply.send({})); return new Promise(() => {}); }\n" });

      await expect(manager.loadFromEntry(entry)).rejects.toThrow(/module "hooked": setup .*failed: timed out after 300 ms/);

      expect(routeAnswers(manager)).toBe(false);
      expect(fs.existsSync(path.join(configDir, 'state', 'hooked.json'))).toBe(false);
    });

    it('a backend whose import hangs (top-level await) times out and keeps the old instance', async () => {
      const manager = new ModuleManager({ configDir, hookTimeoutMs: 100 });
      await manager.loadFromEntry(writeModule({}));

      const entry = writeModule({ version: '2.0.0', backend: 'await new Promise(() => {});\nexport default function () {}\n' });
      await expect(manager.loadFromEntry(entry)).rejects.toThrow(/cannot import the backend .*timed out after 100 ms/s);

      expect(manager.get('hooked')?.manifest.version).toBe('1.0.0');
      expect(routeAnswers(manager)).toBe(true);
      await manager.shutdown();
    });

    it('APP_CORE_HOOK_TIMEOUT_MS sets the timeout of the manager', async () => {
      vi.stubEnv('APP_CORE_HOOK_TIMEOUT_MS', '40');
      try {
        const manager = new ModuleManager({ configDir });
        await expect(manager.loadFromEntry(writeModule({ backend: 'export default function () { return new Promise(() => {}); }\n' }))).rejects.toThrow(/timed out after 40 ms/);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('an invalid APP_CORE_HOOK_TIMEOUT_MS is an explicit startup error naming the variable', async () => {
      for (const value of ['abc', '0', '-5', '1.5', '10s']) {
        vi.stubEnv('APP_CORE_HOOK_TIMEOUT_MS', value);
        try {
          expect(() => new ModuleManager({ configDir })).toThrow(new RegExp(`APP_CORE_HOOK_TIMEOUT_MS="${value}" is not a positive integer`));
          await expect(buildServer({ configDir })).rejects.toThrow(/APP_CORE_HOOK_TIMEOUT_MS/);
        } finally {
          vi.unstubAllEnvs();
        }
      }
    });
  });

  describe('state file', () => {
    const stateFile = () => path.join(configDir, 'state', 'hooked.json');

    it('a corrupt state file is an explicit error naming the file and the fix, and the running instance keeps serving', async () => {
      const manager = new ModuleManager({ configDir });
      await manager.loadFromEntry(writeModule({}));

      for (const content of ['{not json', '{"version": 3}', '{}']) {
        fs.writeFileSync(stateFile(), content);
        await expect(manager.loadFromEntry(writeModule({ version: '2.0.0' }))).rejects.toThrow(new RegExp(`module "hooked": its state file .*hooked\\.json.*delete it to load the module as a first install`, 's'));
        expect(manager.get('hooked')?.manifest.version).toBe('1.0.0');
        expect(routeAnswers(manager)).toBe(true);
      }
      expect(manager.listFailed()[0]?.error).toContain(stateFile());
      await manager.shutdown();
    });

    it('persists the version only after setup succeeded: setup observes the previous state still on disk', async () => {
      const manager = new ModuleManager({ configDir });
      await manager.loadFromEntry(writeModule({}));
      const seen: string[] = [];
      (globalThis as { __seenState?: (v: string) => void }).__seenState = (v) => seen.push(v);
      const probe = `export default function () { globalThis.__seenState(JSON.parse(process.getBuiltinModule('node:fs').readFileSync(${JSON.stringify(stateFile())}, 'utf8')).version); }\n`;
      await manager.loadFromEntry(writeModule({ version: '2.0.0', backend: probe }));
      expect(seen).toEqual(['1.0.0']);
      expect(stateOf()).toEqual({ version: '2.0.0' });
      await manager.shutdown();
    });
  });

  it('serializes operations on one id: an unload issued during a slow load runs after it', async () => {
    const manager = new ModuleManager({ configDir });
    const slow = writeModule({ backend: `export default async function (ctx) { await new Promise((r) => setTimeout(r, 60)); ${mark('setup:slow')} ctx.registerRoute('GET', '/ping', (req, reply) => reply.send({})); }\n`, teardown: hook('teardown') });

    const loading = manager.loadFromEntry(slow);
    const unloading = manager.unload('hooked');
    await Promise.all([loading, unloading]);

    expect(log()).toEqual(['setup:slow', 'teardown:1.0.0']);
    expect(manager.get('hooked')).toBeUndefined();
    expect(routeAnswers(manager)).toBe(false);
  });
});
