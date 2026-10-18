import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ModuleManager } from '../src/loader.js';
import { readModuleLog, resetModuleLog, writeTestModule } from './moduleFactory.js';

// Decision 95: the teardown hook knows why it runs (`reason`) and receives what setup returned (`instance`);
// migrate gets neither.

const LOG_CONTEXT_TEARDOWN =
  "export default function (ctx) { (globalThis.__moduleLog ??= []).push('teardown:' + JSON.stringify({ ...ctx, instance: ctx.instance === undefined ? '(none)' : ctx.instance })); }\n";

interface TeardownLogEntry {
  id: string;
  version: string;
  previousVersion: string | null;
  dataDir: string;
  reason: string;
  instance: unknown;
}

describe('teardown context: reason and instance', () => {
  let configDir: string;
  let scratch: string;
  let manager: ModuleManager;

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-teardown-'));
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-teardown-mods-'));
    resetModuleLog();
    manager = new ModuleManager({ configDir });
  });

  afterEach(async () => {
    await manager.shutdown();
    fs.rmSync(configDir, { recursive: true, force: true });
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  const entryOf = (id: string, manifestPath: string) => ({ id, source: { type: 'file' as const, path: manifestPath } });
  const teardownLog = (): TeardownLogEntry[] =>
    readModuleLog()
      .filter((l) => l.startsWith('teardown:{'))
      .map((l) => JSON.parse(l.slice('teardown:'.length)) as TeardownLogEntry);

  describe('reason', () => {
    it('update: a new version replaces the running one', async () => {
      const manifest = writeTestModule(scratch, 'm', { teardown: LOG_CONTEXT_TEARDOWN });
      await manager.loadFromEntry(entryOf('m', manifest));
      writeTestModule(scratch, 'm', { version: '1.1.0', teardown: LOG_CONTEXT_TEARDOWN });
      await manager.loadFromEntry(entryOf('m', manifest));

      expect(teardownLog()).toEqual([expect.objectContaining({ id: 'm', version: '1.0.0', reason: 'update' })]);
    });

    it('unload: unloaded without being unregistered', async () => {
      await manager.loadFromEntry(entryOf('m', writeTestModule(scratch, 'm', { teardown: LOG_CONTEXT_TEARDOWN })));
      await manager.unload('m');

      expect(teardownLog()).toEqual([expect.objectContaining({ id: 'm', reason: 'unload' })]);
      expect(manager.get('m')).toBeUndefined();
    });

    it('unregister: removed on purpose', async () => {
      await manager.loadFromEntry(entryOf('m', writeTestModule(scratch, 'm', { teardown: LOG_CONTEXT_TEARDOWN })));
      await manager.forget('m');

      expect(teardownLog()).toEqual([expect.objectContaining({ id: 'm', reason: 'unregister' })]);
    });

    it('shutdown: app-core stops', async () => {
      await manager.loadFromEntry(entryOf('m', writeTestModule(scratch, 'm', { teardown: LOG_CONTEXT_TEARDOWN })));
      await manager.shutdown();

      expect(teardownLog()).toEqual([expect.objectContaining({ id: 'm', reason: 'shutdown' })]);
    });

    it('dependency: a module it requires went away', async () => {
      await manager.loadFromEntry(entryOf('p', writeTestModule(scratch, 'p')));
      await manager.loadFromEntry(entryOf('d', writeTestModule(scratch, 'd', { requires: { p: '*' }, teardown: LOG_CONTEXT_TEARDOWN })));
      await manager.forget('p');

      expect(teardownLog()).toEqual([expect.objectContaining({ id: 'd', reason: 'dependency' })]);
    });

    it('carries the same id, version, previousVersion and dataDir as the instance hook context', async () => {
      const manifest = writeTestModule(scratch, 'm', { teardown: LOG_CONTEXT_TEARDOWN });
      const loaded = await manager.loadFromEntry(entryOf('m', manifest));
      await manager.unload('m');

      expect(teardownLog()).toEqual([{ ...loaded.hookContext, reason: 'unload', instance: '(none)' }]);
      // The stored hook context stays the migrate shape: no reason, no instance.
      expect(Object.keys(loaded.hookContext).sort()).toEqual(['dataDir', 'id', 'previousVersion', 'version']);
    });
  });

  describe('instance', () => {
    const SETUP_RETURNING_INSTANCE = "export default function () { (globalThis.__moduleLog ??= []).push('setup'); return { counter: 41, label: 'v1' }; }\n";

    it('hands the value returned by setup to teardown', async () => {
      const manifest = writeTestModule(scratch, 'm', { backend: SETUP_RETURNING_INSTANCE, teardown: LOG_CONTEXT_TEARDOWN });
      await manager.loadFromEntry(entryOf('m', manifest));
      await manager.unload('m');

      expect(teardownLog()[0]?.instance).toEqual({ counter: 41, label: 'v1' });
    });

    it('is the very same object (identity), so teardown can flush live state', async () => {
      const backend = "export default function () { const state = { n: 0 }; globalThis.__liveState = state; return state; }\n";
      const teardown = "export default function (ctx) { (globalThis.__moduleLog ??= []).push('same:' + (ctx.instance === globalThis.__liveState)); }\n";
      await manager.loadFromEntry(entryOf('m', writeTestModule(scratch, 'm', { backend, teardown })));
      await manager.unload('m');

      expect(readModuleLog()).toEqual(['same:true']);
    });

    it('awaits an async setup and hands over its resolved value', async () => {
      const backend = "export default async function () { await new Promise((r) => setTimeout(r, 10)); return 'resolved'; }\n";
      await manager.loadFromEntry(entryOf('m', writeTestModule(scratch, 'm', { backend, teardown: LOG_CONTEXT_TEARDOWN })));
      await manager.unload('m');

      expect(teardownLog()[0]?.instance).toBe('resolved');
    });

    it('is undefined when setup returns nothing', async () => {
      await manager.loadFromEntry(entryOf('m', writeTestModule(scratch, 'm', { teardown: LOG_CONTEXT_TEARDOWN })));
      await manager.unload('m');

      expect(teardownLog()[0]?.instance).toBe('(none)');
    });

    it('on an update the old teardown receives the OLD instance, not the new one', async () => {
      const manifest = writeTestModule(scratch, 'm', { backend: SETUP_RETURNING_INSTANCE, teardown: LOG_CONTEXT_TEARDOWN });
      await manager.loadFromEntry(entryOf('m', manifest));
      writeTestModule(scratch, 'm', {
        version: '2.0.0',
        backend: "export default function () { return { counter: 0, label: 'v2' }; }\n",
        teardown: LOG_CONTEXT_TEARDOWN,
      });
      await manager.loadFromEntry(entryOf('m', manifest));
      await manager.unload('m');

      expect(teardownLog().map((t) => (t.instance as { label: string }).label)).toEqual(['v1', 'v2']);
    });

    it('migrate runs before setup and gets neither instance nor reason', async () => {
      const migrate = "export default function (ctx) { (globalThis.__moduleLog ??= []).push('migrate:keys=' + Object.keys(ctx).sort().join(',')); }\n";
      const backend = "export default function () { (globalThis.__moduleLog ??= []).push('setup'); return { counter: 1 }; }\n";
      const manifest = writeTestModule(scratch, 'm', { backend, migrate });
      await manager.loadFromEntry(entryOf('m', manifest));
      writeTestModule(scratch, 'm', { version: '1.1.0', backend, migrate });
      resetModuleLog();
      await manager.loadFromEntry(entryOf('m', manifest));

      expect(readModuleLog()).toEqual(['migrate:keys=dataDir,id,previousVersion,version', 'setup']);
    });

    it('a failing setup leaves no instance behind: teardown does not run for it', async () => {
      const manifest = writeTestModule(scratch, 'm', { backend: "export default function () { throw new Error('boom'); }\n", teardown: LOG_CONTEXT_TEARDOWN });
      await expect(manager.loadFromEntry(entryOf('m', manifest))).rejects.toThrow(/boom/);
      await manager.shutdown();

      expect(teardownLog()).toEqual([]);
    });
  });
});
