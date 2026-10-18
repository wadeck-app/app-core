import { describe, it, expect, beforeEach } from 'vitest';
import { ModuleManager } from '../src/loader.js';
import { readFixtureBTicks, resetFixtureBTicks } from './fixtureTicks.js';
import { fixtureManifest, scratchConfigDir } from './fixtureManifests.js';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('ModuleManager.loadFromEntry (dynamic import with cache-busting)', () => {
  beforeEach(() => {
    resetFixtureBTicks();
  });

  it('loads module-a and resolves its inline widget view', async () => {
    const manager = new ModuleManager({ configDir: scratchConfigDir() });
    const loaded = await manager.loadFromEntry({
      id: 'module-a',
      source: { type: 'file', path: fixtureManifest('app-module-minimal') },
    });
    expect(loaded.manifest.version).toBe('1.0.0');
    expect(loaded.resolvedViews).toMatchObject([
      { kind: 'widget', slot: 'dashboard', label: 'Fixture A Widget', view: { $type: 'Badge', label: 'fixture-a' } },
    ]);
  });

  it('resolves a path-type view by reading and YAML-parsing it', async () => {
    const manager = new ModuleManager({ configDir: scratchConfigDir() });
    const loaded = await manager.loadFromEntry({
      id: 'module-b',
      source: { type: 'file', path: fixtureManifest('app-module-lifecycle') },
    });
    const page = loaded.resolvedViews.find((v) => v.kind === 'page');
    expect(page?.view).toEqual({ $type: 'Badge', label: 'fixture-b-page' });
  });

  it('gives two loads of bumped versions distinct module instances, not the cached one', async () => {
    const manager = new ModuleManager({ configDir: scratchConfigDir() });
    await manager.loadFromEntry({
      id: 'module-b',
      source: { type: 'file', path: fixtureManifest('app-module-lifecycle') },
    });
    await wait(30);
    const ticksAfterV1 = readFixtureBTicks().v1;
    expect(ticksAfterV1).toBeGreaterThan(0);

    // Simulate an update push: same module id, new manifest/version (module-b-v2 fixture).
    await manager.loadFromEntry({
      id: 'module-b',
      source: { type: 'file', path: fixtureManifest('app-module-lifecycle-v2') },
    });
    const ticksRightAfterSwap = readFixtureBTicks().v1;
    await wait(30);
    const ticksAfterSwap = readFixtureBTicks();

    // v1's interval must have been cleared by dispose() on unload --
    // its counter must not advance further after the swap.
    expect(ticksAfterSwap.v1).toBe(ticksRightAfterSwap);
    // v2 is the fresh instance's own interval, ticking independently.
    expect(ticksAfterSwap.v2).toBeGreaterThan(0);
  });

  it('unload() disposes the moduleContext and stops its interval', async () => {
    const manager = new ModuleManager({ configDir: scratchConfigDir() });
    await manager.loadFromEntry({
      id: 'module-b',
      source: { type: 'file', path: fixtureManifest('app-module-lifecycle') },
    });
    await wait(30);
    await manager.unload('module-b');
    const ticksRightAfterUnload = readFixtureBTicks().v1;
    await wait(30);
    expect(readFixtureBTicks().v1).toBe(ticksRightAfterUnload);
    expect(manager.get('module-b')).toBeUndefined();
  });
});
