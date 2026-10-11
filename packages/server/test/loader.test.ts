import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'node:path';
import * as url from 'node:url';
import { ModuleManager } from '../src/loader.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '..', '..', 'test-app-modules');

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('ModuleManager.loadFromEntry (dynamic import with cache-busting)', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>)['__fixtureBTicks'] = undefined;
  });

  it('loads module-a and resolves its inline widget view', async () => {
    const manager = new ModuleManager();
    const loaded = await manager.loadFromEntry({
      id: 'module-a',
      source: { type: 'file', path: path.join(fixturesDir, 'app-module-minimal', 'manifest.json') },
    });
    expect(loaded.manifest.version).toBe('1.0.0');
    expect(loaded.resolvedViews).toMatchObject([
      { kind: 'widget', slot: 'dashboard', label: 'Fixture A Widget', view: { $type: 'Badge', label: 'fixture-a' } },
    ]);
  });

  it('resolves a path-type view by reading and YAML-parsing it', async () => {
    const manager = new ModuleManager();
    const loaded = await manager.loadFromEntry({
      id: 'module-b',
      source: { type: 'file', path: path.join(fixturesDir, 'app-module-lifecycle', 'manifest.json') },
    });
    const page = loaded.resolvedViews.find((v) => v.kind === 'page');
    expect(page?.view).toEqual({ $type: 'Badge', label: 'fixture-b-page' });
  });

  it('gives two loads of bumped versions distinct module instances, not the cached one', async () => {
    const manager = new ModuleManager();
    await manager.loadFromEntry({
      id: 'module-b',
      source: { type: 'file', path: path.join(fixturesDir, 'app-module-lifecycle', 'manifest.json') },
    });
    await wait(30);
    const ticksAfterV1 = (globalThis as any).__fixtureBTicks.v1;
    expect(ticksAfterV1).toBeGreaterThan(0);

    // Simulate an update push: same module id, new manifest/version (module-b-v2 fixture).
    await manager.loadFromEntry({
      id: 'module-b',
      source: { type: 'file', path: path.join(fixturesDir, 'app-module-lifecycle', 'v2-fixture', 'manifest.json') },
    });
    const ticksRightAfterSwap = (globalThis as any).__fixtureBTicks.v1;
    await wait(30);
    const ticksAfterSwap = (globalThis as any).__fixtureBTicks;

    // v1's interval must have been cleared by dispose() on unload --
    // its counter must not advance further after the swap.
    expect(ticksAfterSwap.v1).toBe(ticksRightAfterSwap);
    // v2 is the fresh instance's own interval, ticking independently.
    expect(ticksAfterSwap.v2).toBeGreaterThan(0);
  });

  it('unload() disposes the moduleContext and stops its interval', async () => {
    const manager = new ModuleManager();
    await manager.loadFromEntry({
      id: 'module-b',
      source: { type: 'file', path: path.join(fixturesDir, 'app-module-lifecycle', 'manifest.json') },
    });
    await wait(30);
    manager.unload('module-b');
    const ticksRightAfterUnload = (globalThis as any).__fixtureBTicks.v1;
    await wait(30);
    expect((globalThis as any).__fixtureBTicks.v1).toBe(ticksRightAfterUnload);
    expect(manager.get('module-b')).toBeUndefined();
  });
});
