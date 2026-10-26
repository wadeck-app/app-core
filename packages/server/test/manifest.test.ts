import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { parseManifest, parseRegistrationPayload, UnsupportedSourceTypeError } from '../src/manifest.js';

describe('parseManifest', () => {
  it('accepts a well-formed manifest with one extension point', () => {
    const manifest = parseManifest({
      id: 'queue',
      version: '1.0.0',
      backendEntryPath: './backend.mjs',
      extensionPoints: [
        { kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: { $type: 'TextBox' } } },
      ],
    });
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.extensionPoints).toHaveLength(1);
  });

  it('rejects a manifest with zero extension points', () => {
    expect(() =>
      parseManifest({ id: 'queue', version: '1.0.0', backendEntryPath: './backend.mjs', extensionPoints: [] }),
    ).toThrow();
  });

  it('rejects a manifest missing backendEntryPath', () => {
    expect(() =>
      parseManifest({
        id: 'queue',
        version: '1.0.0',
        extensionPoints: [{ kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: {} } }],
      }),
    ).toThrow();
  });

  it('rejects an extension point with an invalid view.type', () => {
    expect(() =>
      parseManifest({
        id: 'queue',
        version: '1.0.0',
        backendEntryPath: './backend.mjs',
        extensionPoints: [{ kind: 'widget', slot: 'dashboard', view: { type: 'react', value: {} } }],
      }),
    ).toThrow();
  });
});

describe('parseRegistrationPayload', () => {
  it('accepts a file source', () => {
    const payload = parseRegistrationPayload({ id: 'queue', source: { type: 'file', path: '/tmp/manifest.json' } });
    expect(payload.source.type).toBe('file');
  });

  it('rejects an npm source in v1 with UnsupportedSourceTypeError', () => {
    expect(() =>
      parseRegistrationPayload({ id: 'queue', source: { type: 'npm', package: '@wadeck-app/queue-module', version: '1.0.0' } }),
    ).toThrow(UnsupportedSourceTypeError);
  });

  it('rejects a payload missing id', () => {
    expect(() => parseRegistrationPayload({ source: { type: 'file', path: '/tmp/manifest.json' } })).toThrow();
  });
});

describe('page path', () => {
  const page = (pagePath: string) =>
    parseManifest({
      id: 'queue',
      version: '1.0.0',
      backendEntryPath: './api-backend/backend.mjs',
      extensionPoints: [{ kind: 'page', slot: 'nav', path: pagePath, view: { type: 'inline', value: {} } }],
    });

  it('accepts "/" as the module home page, plain paths and parameterised paths', () => {
    for (const ok of ['/', '/jobs', '/jobs/:id', '/jobs/:id/logs', '/a-b_c/:job_id']) {
      expect(() => page(ok), ok).not.toThrow();
    }
  });

  it('rejects empty, relative, trailing-slash, dot-segment and double-slash paths', () => {
    for (const bad of ['', 'jobs', '/jobs/', '/jobs//x', '/../x', '/jobs/:', '/a b']) {
      expect(() => page(bad), bad).toThrow();
    }
  });
});

describe('parseManifest: separators in the side menu', () => {
  const withPage = (page: Record<string, unknown>) => ({
    id: 'queue',
    version: '1.0.0',
    backendEntryPath: './backend.mjs',
    extensionPoints: [{ kind: 'page', slot: 'nav', label: 'Events', path: '/events', view: { type: 'inline', value: { $type: 'TextBox' } }, ...page }],
  });

  it('accepts separatorBefore, with or without a groupLabel, on a page of the menu', () => {
    expect(parseManifest(withPage({ separatorBefore: true })).extensionPoints[0]?.separatorBefore).toBe(true);
    const labelled = parseManifest(withPage({ separatorBefore: true, groupLabel: 'Admin' })).extensionPoints[0];
    expect(labelled?.groupLabel).toBe('Admin');
  });

  it('accepts them on a page contributed to another module menu', () => {
    expect(() => parseManifest(withPage({ slot: 'flow:nav', separatorBefore: true, groupLabel: 'Charts' }))).not.toThrow();
  });

  // The messages the author reads (a thrown ZodError prints as escaped JSON).
  const problemsOf = (fn: () => unknown): string[] => {
    try {
      fn();
    } catch (err) {
      if (err instanceof ZodError) {
        return err.issues.map((i) => i.message);
      }
      throw err;
    }
    return [];
  };

  it('refuses a groupLabel without separatorBefore, and says how to fix it', () => {
    const fix = '"groupLabel" is the caption of the separator: add "separatorBefore": true, or remove "groupLabel".';
    expect(problemsOf(() => parseManifest(withPage({ groupLabel: 'Admin' })))).toEqual([fix]);
    expect(problemsOf(() => parseManifest(withPage({ separatorBefore: false, groupLabel: 'Admin' })))).toEqual([fix]);
  });

  it('refuses an empty groupLabel', () => {
    expect(() => parseManifest(withPage({ separatorBefore: true, groupLabel: '  ' }))).toThrow(/groupLabel must not be empty/);
  });

  it('refuses them anywhere but on a page of the menu, naming the kind and the slot', () => {
    // (A widget with a path is also refused for that path: only the separator problem is looked at.)
    expect(problemsOf(() => parseManifest(withPage({ kind: 'widget', slot: 'dashboard', separatorBefore: true })))).toContainEqual(
      expect.stringContaining('"separatorBefore" only shapes the side menu (kind "page", slot "nav" or "<module>:nav"); this is kind "widget" on slot "dashboard"'),
    );
    expect(problemsOf(() => parseManifest(withPage({ slot: 'route', separatorBefore: true })))).toContainEqual(expect.stringContaining('kind "page" on slot "route"'));
  });
});
