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

  // zod 4 says "Invalid key in record" for a bad key of a record: the keys are checked by hand so that the author reads why.
  it('says which module id of "requires" is wrong and what an id looks like, under the path of that key', () => {
    const base = { id: 'queue', version: '1.0.0', backendEntryPath: './backend.mjs', extensionPoints: [{ kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: {} } }] };
    let error: ZodError | undefined;
    try {
      parseManifest({ ...base, requires: { 'Not A Module': '^1.0.0' } });
    } catch (err) {
      error = err as ZodError;
    }
    expect(error?.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))).toEqual([{ path: 'requires.Not A Module', message: expect.stringContaining('module id must') }]);
  });

  it('says why a slot name of "expose.slots" is refused: its pattern, and that "nav" is reserved', () => {
    const base = { id: 'queue', version: '1.0.0', backendEntryPath: './backend.mjs', extensionPoints: [{ kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: {} } }] };
    const messages = (slots: Record<string, unknown>): string[] => {
      try {
        parseManifest({ ...base, expose: { slots } });
      } catch (err) {
        return (err as ZodError).issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      }
      return [];
    };
    expect(messages({ nav: { accepts: ['Badge'] } })).toEqual([expect.stringMatching(/^expose.slots.nav: slot name "nav" is reserved/)]);
    expect(messages({ 'Bad Name': { accepts: ['Badge'] } })).toEqual([expect.stringMatching(/^expose.slots.Bad Name: slot name must/)]);
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

describe('parseManifest: tabs of the third level', () => {
  const view = { type: 'inline', value: { $type: 'TextBox' } };
  const manifest = (pages: Array<Record<string, unknown>>) => ({
    id: 'task',
    version: '1.0.0',
    backendEntryPath: './backend.mjs',
    extensionPoints: pages.map((p) => ({ kind: 'page', slot: 'route', view, ...p })),
  });
  const tabs = [
    { path: '/tasks/p/:project/:id', label: 'Task', tab: { group: 'task', label: 'Details' } },
    { path: '/tasks/p/:project/:id/history', label: 'Task history', tab: { group: 'task', label: 'History', order: 20 } },
  ];
  const message = (input: unknown): string => {
    try {
      parseManifest(input);
    } catch (err) {
      return (err as ZodError).issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' | ');
    }
    return '';
  };

  it('accepts pages of a module that share a group, with the same parameters', () => {
    const parsed = parseManifest(manifest(tabs));
    expect(parsed.extensionPoints.map((ep) => ep.tab)).toEqual([{ group: 'task', label: 'Details' }, { group: 'task', label: 'History', order: 20 }]);
  });

  it('accepts a page of the menu as a tab too, and several independent groups', () => {
    const input = manifest([
      { slot: 'nav', path: '/tasks', label: 'Tasks', tab: { group: 'lists', label: 'List' } },
      { slot: 'nav', path: '/tree', label: 'Tree', tab: { group: 'lists', label: 'Tree' } },
      ...tabs,
    ]);
    expect(() => parseManifest(input)).not.toThrow();
  });

  it('refuses a group of one page, and says what to do', () => {
    expect(message(manifest([tabs[0]!]))).toContain('tab group "task" has one page ("/tasks/p/:project/:id"): tabs need at least two');
  });

  it('refuses pages of one group whose parameters differ, naming both addresses', () => {
    const text = message(manifest([tabs[0]!, { path: '/tasks/:id/history', label: 'H', tab: { group: 'task', label: 'History' } }]));
    expect(text).toContain('tab group "task": "/tasks/:id/history" has the parameters [id] but "/tasks/p/:project/:id" has [id, project]');
    expect(text).toContain('use the same names');
  });

  it('refuses two tabs with the same label in a group', () => {
    expect(message(manifest([tabs[0]!, { path: '/tasks/p/:project/:id/x', label: 'X', tab: { group: 'task', label: 'Details' } }]))).toContain('two tabs labelled "Details"');
  });

  it('refuses a tab that is not a page of this module with an address', () => {
    expect(message(manifest([{ ...tabs[0]!, slot: 'flow:nav', path: '/x' }, tabs[1]!]))).toContain('"tab" makes a page of this module a tab');
    expect(message(manifest([{ ...tabs[0]!, kind: 'widget', slot: 'dashboard', path: undefined }, tabs[1]!]))).toContain('"tab" makes a page of this module a tab');
    expect(message(manifest([{ ...tabs[0]!, path: undefined }, tabs[1]!]))).toContain('"tab" needs the page to have a "path"');
  });

  it('refuses an empty label, a bad group name and an unknown key', () => {
    expect(message(manifest([{ ...tabs[0]!, tab: { group: 'task', label: ' ' } }, tabs[1]!]))).toContain('tab.label must not be empty');
    expect(message(manifest([{ ...tabs[0]!, tab: { group: 'Task Group', label: 'A' } }, tabs[1]!]))).toContain('tab.group must be a name of lower case');
    expect(message(manifest([{ ...tabs[0]!, tab: { group: 'task', label: 'A', icon: 'x' } }, tabs[1]!]))).toContain('Unrecognized key');
  });
});

describe('parseManifest: figures next to menu entries and tabs (count)', () => {
  const view = { type: 'inline', value: { $type: 'TextBox' } };
  const manifest = (pages: Array<Record<string, unknown>>) => ({
    id: 'queue',
    version: '1.0.0',
    backendEntryPath: './backend.mjs',
    extensionPoints: pages.map((p) => ({ kind: 'page', slot: 'nav', view, ...p })),
  });
  const message = (input: unknown): string => {
    try {
      parseManifest(input);
    } catch (err) {
      return (err as ZodError).issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' | ');
    }
    return '';
  };

  it('accepts a count on a menu entry, with or without a field and a refresh', () => {
    const parsed = parseManifest(manifest([{ label: 'DLQ', path: '/dlq', count: { route: '/dlq/count', field: 'total', refreshSeconds: 30 } }, { label: 'Pending', path: '/pending', count: { route: '/pending/count' } }]));
    expect(parsed.extensionPoints[0]?.count).toEqual({ route: '/dlq/count', field: 'total', refreshSeconds: 30 });
    expect(parsed.extensionPoints[1]?.count).toEqual({ route: '/pending/count' });
  });

  it('accepts a count on a page of another module\'s menu', () => {
    expect(() => parseManifest(manifest([{ slot: 'flow:nav', label: 'Charts', path: '/charts', count: { route: '/charts/count' } }]))).not.toThrow();
  });

  it('refuses a count on a page that is not an entry of the menu, and says where it goes', () => {
    expect(message(manifest([{ slot: 'route', label: 'Item', path: '/items/:id', count: { route: '/n' } }]))).toContain('"count" is the figure of an entry of the side menu');
    expect(message(manifest([{ slot: 'route', label: 'Item', path: '/items/:id', count: { route: '/n' } }]))).toContain('use "tab.count" for a tab');
  });

  it('refuses a ":param" in the route of a menu entry, which has no parameters to give it', () => {
    expect(message(manifest([{ label: 'DLQ', path: '/dlq', count: { route: '/dlq/:id/count' } }]))).toContain('has a ":param", but a menu entry has no parameters');
  });

  it('accepts a count on a tab whose route uses the parameters of the page, and refuses a parameter the page does not have', () => {
    const tabs = (route: string) =>
      manifest([
        { slot: 'route', label: 'Task', path: '/tasks/:project/:id', tab: { group: 'task', label: 'Details' } },
        { slot: 'route', label: 'History', path: '/tasks/:project/:id/history', tab: { group: 'task', label: 'History', count: { route, field: 'total' } } },
      ]);
    expect(() => parseManifest(tabs('/tasks/:project/:id/history/count'))).not.toThrow();
    expect(message(tabs('/tasks/:other/count'))).toContain('uses ":other" but the page "/tasks/:project/:id/history" has no such parameter (it has [id, project])');
  });

  it('accepts a tone, an icon and a label, as defaults for what the route answers', () => {
    const parsed = parseManifest(manifest([{ label: 'DLQ', path: '/dlq', count: { route: '/status', field: 'dlqCount', tone: 'danger', icon: 'warning', label: 'Dead letters' } }]));
    expect(parsed.extensionPoints[0]?.count).toEqual({ route: '/status', field: 'dlqCount', tone: 'danger', icon: 'warning', label: 'Dead letters' });
  });

  it('refuses a tone or an icon that is not in the lists, naming them', () => {
    const tone = message(manifest([{ label: 'A', path: '/a', count: { route: '/a/count', tone: 'purple' } }]));
    expect(tone).toContain('count.tone');
    expect(message(manifest([{ label: 'A', path: '/a', count: { route: '/a/count', icon: 'star' } }]))).toContain('count.icon');
  });

  it('lets a page set the indicator by itself with refreshSeconds -1 and no route, and refuses -1 with a route', () => {
    expect(() => parseManifest(manifest([{ label: 'A', path: '/a', count: { refreshSeconds: -1, tone: 'info' } }]))).not.toThrow();
    expect(message(manifest([{ label: 'A', path: '/a', count: { refreshSeconds: -1, route: '/a/count' } }]))).toContain('nothing is read from the server');
  });

  it('refuses a count without a route unless the page sets it, and says how', () => {
    expect(message(manifest([{ label: 'A', path: '/a', count: { field: 'total' } }]))).toContain('"refreshSeconds": -1');
  });

  it('refuses a malformed count: no route, a bad field, a refresh out of range, an unknown key', () => {
    expect(message(manifest([{ label: 'A', path: '/a', count: { field: 'total' } }]))).toContain('count.route');
    expect(message(manifest([{ label: 'A', path: '/a', count: { route: '/a/count', field: 'a b' } }]))).toContain('count.field must be a path of names separated by "."');
    expect(message(manifest([{ label: 'A', path: '/a', count: { route: '/a/count', refreshSeconds: 4000 } }]))).toContain('count.refreshSeconds must be -1');
    expect(message(manifest([{ label: 'A', path: '/a', count: { route: '/a/count', every: 5 } }]))).toContain('Unrecognized key');
  });
});
