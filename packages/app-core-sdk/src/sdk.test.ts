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

describe('app-core-sdk showInNav', () => {
  const widget = { kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: { $type: 'Badge', label: 'ok' } } };
  const packaged = { id: 'sdk-test', version: '1.0.0', backendEntryPath: './b.cjs', extensionPoints: [widget] };

  it('is optional in the source and in the packaged manifest, and means listed when absent', () => {
    expect(parseSourceManifest({ id: 'sdk-test', extensionPoints: [widget] }).showInNav).toBeUndefined();
    expect(parseManifest(packaged).showInNav).toBeUndefined();
  });

  it('accepts a boolean in both', () => {
    for (const value of [true, false]) {
      expect(parseSourceManifest({ id: 'sdk-test', extensionPoints: [widget], showInNav: value }).showInNav).toBe(value);
      expect(parseManifest({ ...packaged, showInNav: value }).showInNav).toBe(value);
    }
  });

  it('rejects anything else, so "false" (a string) does not silently count as hidden or shown', () => {
    for (const value of ['false', 0, null, 'no']) {
      expect(SourceManifestSchema.safeParse({ id: 'sdk-test', extensionPoints: [widget], showInNav: value }).success, String(value)).toBe(false);
      expect(ManifestSchema.safeParse({ ...packaged, showInNav: value }).success, String(value)).toBe(false);
    }
  });

  it('keeps the source manifest strict for every other unknown key', () => {
    expect(SourceManifestSchema.safeParse({ id: 'sdk-test', extensionPoints: [widget], showInNavigation: false }).success).toBe(false);
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

describe('app-core-sdk title', () => {
  const widget = { kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: { $type: 'Badge', label: 'ok' } } };
  const packaged = { id: 'sdk-test', version: '1.0.0', backendEntryPath: './b.cjs', extensionPoints: [widget] };

  it('is optional in both manifests', () => {
    expect(parseSourceManifest({ id: 'sdk-test', extensionPoints: [widget] }).title).toBeUndefined();
    expect(parseManifest(packaged).title).toBeUndefined();
  });

  it('is trimmed and kept in both', () => {
    expect(parseSourceManifest({ id: 'sdk-test', extensionPoints: [widget], title: '  Flow chart ' }).title).toBe('Flow chart');
    expect(parseManifest({ ...packaged, title: 'Flow chart' }).title).toBe('Flow chart');
  });

  it('rejects a blank or non-string title, saying what to do', () => {
    for (const value of ['', '   ', 3, null]) {
      const source = SourceManifestSchema.safeParse({ id: 'sdk-test', extensionPoints: [widget], title: value });
      expect(source.success, String(value)).toBe(false);
      expect(ManifestSchema.safeParse({ ...packaged, title: value }).success, String(value)).toBe(false);
    }
    const blank = SourceManifestSchema.safeParse({ id: 'sdk-test', extensionPoints: [widget], title: ' ' });
    expect(blank.success ? '' : blank.error.issues[0].message).toContain('remove the field to derive it from the id');
  });
});
