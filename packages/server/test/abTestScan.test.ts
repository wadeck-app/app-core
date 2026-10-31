import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { scanComponentText, scanViews } from '../src/abTestScan.js';
import { buildServer } from '../src/server.js';

const point = (view: unknown, extra: Record<string, unknown> = {}) => ({ kind: 'page', slot: 'nav', view, rawYaml: '', ...extra });

describe('scanViews: $type: AbTest nodes in the views of a module', () => {
  it('finds a test anywhere in a view, including inside the variant of another test', () => {
    const view = {
      $type: 'VerticalStack',
      children: [
        { $type: 'AbTest', id: 'outer', label: 'Outer', initial: 'a', variants: { a: { label: 'A', hint: 'h', view: { $type: 'AbTest', id: 'inner', label: 'Inner', initial: 'x', variants: {} } } } },
      ],
    };
    const found = scanViews({ id: 'm', resolvedViews: [point(view, { path: '/logs' })] as never });
    expect(found.map((f) => [f.id, f.label])).toEqual([['outer', 'Outer'], ['inner', 'Inner']]);
    expect(found[0]).toMatchObject({ source: 'view', moduleId: 'm', where: 'page nav /logs' });
  });

  it('counts a test repeated with the same id once', () => {
    const node = { $type: 'AbTest', id: 'same', label: 'S', initial: 'a', variants: {} };
    expect(scanViews({ id: 'm', resolvedViews: [point(node), point(node, { kind: 'widget', slot: 'dashboard' })] as never })).toHaveLength(1);
  });

  it('ignores a node that is not a test, and keeps the raw text of an id that is an expression', () => {
    const found = scanViews({ id: 'm', resolvedViews: [point({ $type: 'Badge', label: 'AbTest' }), point({ $type: 'AbTest', id: '$route.id' })] as never });
    expect(found.map((f) => f.id)).toEqual(['$route.id']);
  });
});

describe('scanComponentText: useAbTest calls in the code a module ships', () => {
  // The shape a bundler leaves of useAbTest({ id, label, ... }) imported from the shared dsl-ui (taken from the bundle of a real module).
  const bundle =
    'function A(){let t=(0,Pe.useAbTest)({id:Rt.identity,label:"Step identity",initial:_t.identity,options:{plain:{label:"Plain"}}}),' +
    'n=(0,Pe.useAbTest)({id:V8,label:"Step \\"panel\\"",initial:B,options:{}});}' +
    'function internal(spec){return useRegister(spec)} var x=useAbTestLike({id:1});';

  it('counts each call and reads a literal label, escaped quotes included', () => {
    const found = scanComponentText('flow', bundle);
    expect(found).toHaveLength(2);
    expect(found.map((f) => f.label)).toEqual(['Step identity', 'Step \\"panel\\"']);
    expect(found.every((f) => f.source === 'component' && f.moduleId === 'flow')).toBe(true);
  });

  it('counts a call whose label is built by the code, without a label', () => {
    expect(scanComponentText('m', '(0,x.useAbTest)({id:a,label:name,initial:b})')).toEqual([{ source: 'component', moduleId: 'm', label: undefined }]);
  });

  it('does not count the definition of the hook or another function that only looks like it', () => {
    expect(scanComponentText('m', 'function useAbTest(spec){return spec} const q=useAbTestLike({id:1}); useAbTest(spec2)')).toEqual([]);
  });
});

describe('GET /api/ab-tests', () => {
  let dir: string;
  let configDir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-abscan-'));
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-abscan-cfg-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  async function setup(withLib: boolean) {
    fs.mkdirSync(path.join(dir, 'dsl-lib'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'backend.cjs'), 'module.exports = function () {};\n');
    if (withLib) {
      fs.writeFileSync(path.join(dir, 'dsl-lib', 'entries.mjs'), 'export default []; /* (0,u.useAbTest)({id:A,label:"One",initial:"a",options:{}}); (0,u.useAbTest)({id:B,label:"Two",initial:"a",options:{}}) */');
    }
    const view = { $type: 'AbTest', id: 'view-test', label: 'In a view', initial: 'a', variants: { a: { label: 'A', hint: 'h', view: { $type: 'Badge', label: 'a' } }, b: { label: 'B', hint: 'h', view: { $type: 'Badge', label: 'b' } } } };
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({
        id: 'scanned',
        version: '1.0.0',
        backendEntryPath: './backend.cjs',
        ...(withLib ? { dslLib: { entry: './dsl-lib/entries.mjs', shared: {} } } : {}),
        extensionPoints: [{ kind: 'page', slot: 'nav', label: 'Page', path: '/p', view: { type: 'inline', value: view } }],
      }),
    );
    const { server } = await buildServer({ configDir, publicDir: path.join(dir, 'none') });
    const res = await server.inject({ method: 'POST', url: '/api/modules/register', payload: { id: 'scanned', source: { type: 'file', path: path.join(dir, 'manifest.json') } } });
    expect(res.statusCode, res.body).toBe(201);
    return server;
  }

  it('gives the exact count of the views, the estimated count of the components, and the total', async () => {
    const server = await setup(true);
    try {
      const body = (await server.inject({ method: 'GET', url: '/api/ab-tests' })).json() as { exact: number; estimated: number; total: number; views: Array<{ id: string }>; components: Array<{ label?: string }>; unreadable: unknown[] };
      expect(body).toMatchObject({ exact: 1, estimated: 2, total: 3, unreadable: [] });
      expect(body.views[0]?.id).toBe('view-test');
      expect(body.components.map((c) => c.label)).toEqual(['One', 'Two']);
    } finally {
      await server.close();
    }
  });

  it('counts only the views for a module that ships no components, and has an ETag like the other API answers', async () => {
    const server = await setup(false);
    try {
      const res = await server.inject({ method: 'GET', url: '/api/ab-tests' });
      expect(res.json()).toMatchObject({ exact: 1, estimated: 0, total: 1 });
      expect(res.headers['etag']).toBeDefined();
    } finally {
      await server.close();
    }
  });

  it('says which module it could not read instead of leaving it out silently', async () => {
    const server = await setup(true);
    try {
      fs.rmSync(path.join(dir, 'dsl-lib', 'entries.mjs'));
      const body = (await server.inject({ method: 'GET', url: '/api/ab-tests' })).json() as { estimated: number; unreadable: Array<{ moduleId: string; reason: string }> };
      expect(body.estimated).toBe(0);
      expect(body.unreadable).toEqual([{ moduleId: 'scanned', reason: expect.stringContaining('cannot read') }]);
    } finally {
      await server.close();
    }
  });
});
