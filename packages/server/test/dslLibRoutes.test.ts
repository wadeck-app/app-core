import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildServer, type AppCoreServer } from '../src/server.js';

const BUILD_INFO = { builtAt: 'x', dslUi: '2026.10.17-095-7b2c28f1', dslRenderer: '2026.10.17-095-7b2c28f1', react: '19.3.0', reactDom: '19.3.0', reactRouterDom: '7.18.4' };

interface ModuleSpec {
  id?: string;
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
      id: spec.id ?? 'm1',
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

  it('refuses a module whose shared range the shell does not satisfy, and reports it without registering it', async () => {
    await start();
    const bad = writeModule(path.join(root, 'bad'), { id: 'm2', shared: { react: '^18' } });
    const res = await register('m2', bad);
    // A fault of the module, not of the server: 422 and a code the daemon that registers can recognise.
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('shared-version-mismatch');
    expect(res.json().error).toMatch(/react "\^18".*provides 19\.3\.0/);
    const state = await modules();
    expect(state.modules.find((m) => m.id === 'm2')).toBeUndefined();
    // Refused before anything changed and never registered: no registry entry, no recorded failure (decision 94).
    expect(res.json().error).toMatch(/Rebuild the module's dsl-lib/);
    expect(res.json().retained).toBe(false);
    expect(state.failed.find((f) => f.id === 'm2')).toBeUndefined();
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
    expect((await register('m1', manifestPath, '/api/modules/update')).statusCode).toBe(422);
    const state = await modules();
    expect(state.modules.find((m) => m.id === 'm1')).toBeDefined();
    expect(state.failed.find((f) => f.id === 'm1')).toBeDefined();
  });

  it('says where the shell version comes from: the file and when the shell was built', async () => {
    await start({ ...BUILD_INFO, builtAt: '2026-10-18T12:44:33.900Z', commit: '430ffa0e' });
    const res = await register('m2', writeModule(path.join(root, 'bad'), { id: 'm2', shared: { react: '^18' } }));
    expect(res.json().error).toContain('build-info.json, built 2026-10-18T12:44:33.900Z, commit 430ffa0e');
  });

  it('says so when the served shell is older than the packages installed next to it, and warns at startup', async () => {
    // A checkout: <root>/public (the served shell) beside <root>/node_modules with a newer dsl-ui than the shell was built with.
    const installed = path.join(root, 'node_modules', '@wadeck-app', 'dsl-ui');
    fs.mkdirSync(installed, { recursive: true });
    fs.writeFileSync(path.join(installed, 'package.json'), JSON.stringify({ name: '@wadeck-app/dsl-ui', version: '2026.10.22-123-a0f51351' }));
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await start();
      const res = await register('m2', writeModule(path.join(root, 'bad'), { id: 'm2', shared: { '@wadeck-app/dsl-ui': '>=2026.10.22-0' } }));
      expect(res.statusCode).toBe(422);
      expect(res.json().error).toContain('the served shell looks stale (@wadeck-app/dsl-ui 2026.10.22-123-a0f51351 installed, 2026.10.17-095-7b2c28f1 in the served shell)');
      expect(res.json().error).toContain('npm run build:full');
      expect(stderr.mock.calls.map((c) => String(c[0])).join('')).toContain('is older than the installed packages');
    } finally {
      stderr.mockRestore();
    }
  });

  it('does not call the shell stale when nothing is installed next to it to compare with', async () => {
    await start();
    const res = await register('m2', writeModule(path.join(root, 'bad'), { id: 'm2', shared: { react: '^18' } }));
    expect(res.json().error).not.toContain('stale');
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
      id: 'm3',
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
