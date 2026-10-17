import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildServer, type AppCoreServer } from '../src/server.js';

const BUILD_INFO = { builtAt: 'x', dslUi: '2026.10.17-095-7b2c28f1', dslRenderer: '2026.10.17-095-7b2c28f1', react: '19.3.0', reactDom: '19.3.0', reactRouterDom: '7.18.4' };

interface ModuleSpec {
  version?: string;
  shared?: Record<string, string>;
  entryBody?: string;
  backendBody?: string;
}

function writeModule(dir: string, spec: ModuleSpec = {}): string {
  fs.mkdirSync(path.join(dir, 'api-backend'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'dsl-lib'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      version: spec.version ?? '1.0.0',
      backendEntryPath: './api-backend/backend.mjs',
      extensionPoints: [
        { kind: 'page', slot: 'nav', label: 'Items', view: { type: 'inline', value: { $type: 'Badge', label: 'x' } } },
        { kind: 'page', slot: 'route', path: '/items/:id', view: { type: 'inline', value: { $type: 'Badge', label: '$route.id' } } },
      ],
      dslLib: { entry: './dsl-lib/entries.mjs', css: './dsl-lib/style.css', shared: spec.shared ?? { react: '^19' } },
    }),
  );
  fs.writeFileSync(path.join(dir, 'api-backend', 'backend.mjs'), spec.backendBody ?? 'export default function () {}\n');
  fs.writeFileSync(path.join(dir, 'dsl-lib', 'entries.mjs'), spec.entryBody ?? 'export default [];\n');
  fs.writeFileSync(path.join(dir, 'dsl-lib', 'style.css'), '.x { color: red; }\n');
  return path.join(dir, 'manifest.json');
}

describe('dsl-lib: serving, validation and lifecycle', () => {
  let root: string;
  let app: AppCoreServer;
  let manifestPath: string;
  let moduleDir: string;

  async function start(buildInfo: object | null = BUILD_INFO): Promise<void> {
    const publicDir = path.join(root, 'public');
    fs.mkdirSync(publicDir, { recursive: true });
    if (buildInfo !== null) {
      fs.writeFileSync(path.join(publicDir, 'build-info.json'), JSON.stringify(buildInfo));
    }
    app = await buildServer({ configDir: path.join(root, 'cfg'), publicDir });
  }

  const register = (id: string, file: string, route = '/api/modules/register') =>
    app.server.inject({ method: 'POST', url: route, payload: { id, source: { type: 'file', path: file } } });

  const modules = async () => (await app.server.inject({ method: 'GET', url: '/api/modules' })).json() as {
    modules: Array<{ id: string; extensionPoints: Array<{ path?: string; slot: string }>; dslLib?: { entryUrl: string; cssUrl?: string } }>;
    failed: Array<{ id: string; error: string }>;
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-dsllib-'));
    moduleDir = path.join(root, 'mod');
    manifestPath = writeModule(moduleDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('lists the cache-busted dsl-lib URLs and serves the files with their content types', async () => {
    await start();
    expect((await register('m1', manifestPath)).statusCode).toBe(201);

    const { modules: list } = await modules();
    const mod = list.find((m) => m.id === 'm1');
    expect(mod?.dslLib?.entryUrl).toMatch(/^\/api\/modules\/m1\/_lib\/entries\.mjs\?v=1\.0\.0-[\d.]+-\d+$/);
    expect(mod?.dslLib?.cssUrl).toMatch(/^\/api\/modules\/m1\/_lib\/style\.css\?v=/);

    const entry = await app.server.inject({ method: 'GET', url: mod!.dslLib!.entryUrl });
    expect(entry.statusCode).toBe(200);
    expect(entry.headers['content-type']).toContain('text/javascript');
    expect(entry.body).toBe('export default [];\n');
    const css = await app.server.inject({ method: 'GET', url: mod!.dslLib!.cssUrl! });
    expect(css.headers['content-type']).toContain('text/css');
  });

  it('exposes page paths and route slots in GET /api/modules', async () => {
    await start();
    await register('m1', manifestPath);
    const eps = (await modules()).modules[0]!.extensionPoints;
    expect(eps.map((e) => [e.slot, e.path])).toEqual([
      ['nav', undefined],
      ['route', '/items/:id'],
    ]);
  });

  it.each([
    '/api/modules/m1/_lib/..%2Fmanifest.json',
    '/api/modules/m1/_lib/%2e%2e%2fmanifest.json',
    '/api/modules/m1/_lib/..%5Cmanifest.json',
    '/api/modules/m1/_lib/%2Fetc%2Fpasswd',
    '/api/modules/m1/_lib/sub%2F..%2F..%2Fmanifest.json',
    '/api/modules/m1/_lib/missing.mjs',
    '/api/modules/m1/_lib/',
    '/api/modules/nope/_lib/entries.mjs',
  ])('answers 404 and never leaks files outside dsl-lib/: %s', async (url) => {
    await start();
    await register('m1', manifestPath);
    const res = await app.server.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('backendEntryPath');
  });

  it('refuses a module whose shared range the shell does not satisfy, and lists it as failed', async () => {
    await start();
    const bad = writeModule(path.join(root, 'bad'), { shared: { react: '^18' } });
    const res = await register('m2', bad);
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toMatch(/react "\^18".*provides 19\.3\.0/);
    const state = await modules();
    expect(state.modules.find((m) => m.id === 'm2')).toBeUndefined();
    expect(state.failed.find((f) => f.id === 'm2')?.error).toMatch(/Rebuild the module's dsl-lib/);
    expect((await app.server.inject({ method: 'GET', url: '/api/modules/m2/_lib/entries.mjs' })).statusCode).toBe(404);
  });

  it('warns explicitly, and still loads, when build-info.json is missing', async () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await start(null);
    expect((await register('m1', manifestPath)).statusCode).toBe(201);
    const lines = write.mock.calls.map((c) => String(c[0])).join('');
    expect(lines).toContain('build-info.json');
    expect(lines).toContain('cannot be verified');
    expect(lines).toContain('module "m1": cannot verify dslLib.shared for react');
  });

  it('serves a new URL after a rewrite without a version bump', async () => {
    await start();
    await register('m1', manifestPath);
    const before = (await modules()).modules[0]!.dslLib!.entryUrl;
    fs.writeFileSync(path.join(moduleDir, 'dsl-lib', 'entries.mjs'), 'export default [ /* v2, longer */ ];\n');
    expect((await register('m1', manifestPath, '/api/modules/update')).statusCode).toBe(200);
    const after = (await modules()).modules[0]!.dslLib!.entryUrl;
    expect(after).not.toBe(before);
    expect((await app.server.inject({ method: 'GET', url: after })).body).toContain('v2, longer');
  });

  it('keeps the running module when an update fails the shared check', async () => {
    await start();
    await register('m1', manifestPath);
    writeModule(moduleDir, { version: '2.0.0', shared: { react: '^18' } });
    expect((await register('m1', manifestPath, '/api/modules/update')).statusCode).toBe(500);
    const state = await modules();
    expect(state.modules.find((m) => m.id === 'm1')).toBeDefined();
    expect(state.failed.find((f) => f.id === 'm1')).toBeDefined();
  });

  it('fails a module that is missing its declared dsl-lib file', async () => {
    await start();
    fs.rmSync(path.join(moduleDir, 'dsl-lib', 'entries.mjs'));
    const res = await register('m1', manifestPath);
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toMatch(/dslLib\.entry "\.\/dsl-lib\/entries\.mjs" does not exist/);
  });

  it('refuses a backend that registers a route under the reserved _lib segment', async () => {
    await start();
    const reserved = writeModule(path.join(root, 'reserved'), {
      backendBody: "export default function (ctx) { ctx.registerRoute('GET', '/_lib/x', () => 'no'); }\n",
    });
    const res = await register('m3', reserved);
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toMatch(/reserved/);
  });

  it('stops serving the files after unregister', async () => {
    await start();
    await register('m1', manifestPath);
    const url = (await modules()).modules[0]!.dslLib!.entryUrl;
    expect((await app.server.inject({ method: 'GET', url })).statusCode).toBe(200);
    expect((await app.server.inject({ method: 'POST', url: '/api/modules/unregister', payload: { id: 'm1' } })).statusCode).toBe(200);
    expect((await app.server.inject({ method: 'GET', url })).statusCode).toBe(404);
    expect((await modules()).modules).toEqual([]);
  });
});
