import { describe, it, expect } from 'vitest';
import { ModuleRouteRegistry } from '@wadeck-app/app-core-server/moduleRoutes';
import type { ModuleContext, ModuleSetup, ModuleTeardownContext, ModuleTeardownHook, ModuleTimerHandle } from './index.js';
import { ManifestSchema, SourceManifestSchema, parseManifest, parseSourceManifest, createModuleContext, UnsupportedSourceTypeError, parseRegistrationPayload } from './index.js';

// app-core-sdk is a types/schemas-only package -- these tests prove the
// re-exports actually work end to end, not just compile.
describe('app-core-sdk re-exports', () => {
  it('ManifestSchema/parseManifest validate a real manifest shape', () => {
    const manifest = parseManifest({
      id: 'sdk-test',
      version: '1.0.0',
      backendEntryPath: './api-backend/index.js',
      extensionPoints: [{ kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: { $type: 'Badge', label: 'ok' } } }],
    });
    expect(manifest.version).toBe('1.0.0');
    expect(ManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it('createModuleContext produces a usable ModuleContext', () => {
    const ctx = createModuleContext('test-module', new ModuleRouteRegistry(), '/tmp/data/test-module');
    expect(typeof ctx.setInterval).toBe('function');
    expect(typeof ctx.registerRoute).toBe('function');
    expect(ctx.dataDir).toBe('/tmp/data/test-module');
    ctx.dispose();
  });

  it('parseRegistrationPayload rejects npm source (deferred to v2) via UnsupportedSourceTypeError', () => {
    expect(() => parseRegistrationPayload({ id: 'x', source: { type: 'npm', package: 'y', version: '1.0.0' } })).toThrow(
      UnsupportedSourceTypeError,
    );
  });
});

describe('app-core-sdk manifest id and source manifest', () => {
  const widget = { kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: { $type: 'Badge', label: 'ok' } } };

  it('the output manifest requires an id', () => {
    expect(() => parseManifest({ version: '1.0.0', backendEntryPath: './b.cjs', extensionPoints: [widget] })).toThrow(/id/);
  });

  it('exports the source manifest schema and parser', () => {
    expect(parseSourceManifest({ id: 'sdk-test', extensionPoints: [widget] }).id).toBe('sdk-test');
    expect(SourceManifestSchema.safeParse({ id: 'sdk-test', version: '1', extensionPoints: [widget] }).success).toBe(false);
  });

  it('parses requires and expose, and refuses an unprefixed custom slot', () => {
    const parsed = parseSourceManifest({
      id: 'sdk-test',
      extensionPoints: [{ ...widget, slot: 'other:shared' }],
      requires: { other: '^1.0.0' },
      expose: { slots: { mine: { accepts: ['Badge'] } } },
    });
    expect(parsed.requires).toEqual({ other: '^1.0.0' });
    expect(parsed.expose?.slots?.['mine']?.accepts).toEqual(['Badge']);
    expect(() => parseSourceManifest({ id: 'sdk-test', extensionPoints: [{ ...widget, slot: 'shared' }] })).toThrow(/<providerId>:<slot>/);
  });
});

describe('app-core-sdk module author types (decisions 95 and 97)', () => {
  // Compile-time check that the documented shapes type-check as an author writes them.
  interface Running {
    counter: number;
  }
  const setup: ModuleSetup<Running> = (ctx: ModuleContext) => {
    const handle: ModuleTimerHandle = ctx.setInterval(() => {}, 1_000);
    ctx.clearInterval(handle);
    const once: ModuleTimerHandle = ctx.setTimeout(() => {}, 1_000);
    ctx.clearTimeout(once);
    const listener = (): void => {};
    ctx.on('tick', listener);
    ctx.off('tick', listener);
    return { counter: 1 };
  };
  const teardown: ModuleTeardownHook<Running> = (ctx: ModuleTeardownContext<Running>) => {
    const flushed: number = ctx.instance.counter;
    const why: 'update' | 'unregister' | 'unload' | 'shutdown' | 'dependency' = ctx.reason;
    expect([flushed, why, ctx.dataDir, ctx.previousVersion]).toBeDefined();
  };

  it('setup returns the instance and the handles clear what they started', async () => {
    const ctx = createModuleContext('author', new ModuleRouteRegistry(), '/tmp/data/author');
    const instance = await setup(ctx);
    expect(instance).toEqual({ counter: 1 });
    ctx.dispose();
    await teardown({ id: 'author', version: '1.0.0', previousVersion: null, dataDir: '/tmp/data/author', reason: 'shutdown', instance });
  });
});
