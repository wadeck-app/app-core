import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ZodError } from 'zod';
import { parseManifest } from '../src/manifest.js';
import { buildServer } from '../src/server.js';

type Built = Awaited<ReturnType<typeof buildServer>>;

interface Listing {
  modules: Array<{ id: string; warnings?: string[]; extensionPoints: Array<{ path?: string; inactive?: string; tab?: { group: string; label: string } }> }>;
  failed: Array<{ id: string; error: string }>;
}

interface PageSpec {
  path: string;
  tab: { group: string; label: string; order?: number };
}

// A module can join the tab group of another one ("<moduleId>:<group>"): the provider declares the group, the contributor adds a page.
describe('tab groups joined by another module', () => {
  let configDir: string;
  let scratch: string;
  let server: Built['server'];

  beforeEach(async () => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-tabs-'));
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-tabs-modules-'));
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    server = (await buildServer({ configDir, publicDir: path.join(scratch, 'none') })).server;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await server.close();
    fs.rmSync(configDir, { recursive: true, force: true });
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  function writeModule(id: string, pages: PageSpec[], extra: { requires?: Record<string, string>; optionalRequires?: Record<string, string> } = {}): string {
    const dir = path.join(scratch, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'backend.cjs'), 'module.exports = function () {};\n');
    const manifest = {
      id,
      version: '1.0.0',
      backendEntryPath: './backend.cjs',
      ...extra,
      extensionPoints: pages.map((p) => ({ kind: 'page', slot: 'route', label: p.tab.label, path: p.path, tab: p.tab, view: { type: 'inline', value: { $type: 'Badge', label: p.tab.label } } })),
    };
    const manifestPath = path.join(dir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    return manifestPath;
  }

  const register = (id: string, manifestPath: string) => server.inject({ method: 'POST', url: '/api/modules/register', payload: { id, source: { type: 'file', path: manifestPath } } });
  const listing = async (): Promise<Listing> => (await server.inject({ method: 'GET', url: '/api/modules' })).json() as Listing;
  const PROVIDER_PAGES: PageSpec[] = [
    { path: '/a/:id', tab: { group: 'g', label: 'Summary', order: 10 } },
    { path: '/a/:id/logs', tab: { group: 'g', label: 'Logs', order: 20 } },
  ];

  it('loads a module whose page joins the group of a module it requires, and lists the tab for the shell', async () => {
    expect((await register('prov', writeModule('prov', PROVIDER_PAGES))).statusCode).toBe(201);
    const res = await register('contrib', writeModule('contrib', [{ path: '/c/:id', tab: { group: 'prov:g', label: 'Chart', order: 30 } }], { requires: { prov: '*' } }));
    expect(res.statusCode).toBe(201);
    const contrib = (await listing()).modules.find((m) => m.id === 'contrib');
    expect(contrib?.extensionPoints[0]?.tab).toEqual({ group: 'prov:g', label: 'Chart', order: 30 });
    expect(contrib?.extensionPoints[0]?.inactive).toBeUndefined();
  });

  it('refuses to join a group of a module it does not require, and says how to declare it', async () => {
    await register('prov', writeModule('prov', PROVIDER_PAGES));
    const res = await register('contrib', writeModule('contrib', [{ path: '/c/:id', tab: { group: 'prov:g', label: 'Chart' } }]));
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.json().error).toContain('joins the tab group "prov:g" but "requires" does not list "prov"');
    expect(res.json().error).toContain('optionalRequires');
  });

  it('refuses a group the provider does not declare, naming the groups it declares', async () => {
    await register('prov', writeModule('prov', PROVIDER_PAGES));
    const res = await register('contrib', writeModule('contrib', [{ path: '/c/:id', tab: { group: 'prov:nope', label: 'Chart' } }], { requires: { prov: '*' } }));
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.json().error).toContain('declares no tab group "nope"');
    expect(res.json().error).toContain('prov:g');
  });

  it('refuses a page whose parameters differ from the ones of the group', async () => {
    await register('prov', writeModule('prov', PROVIDER_PAGES));
    const res = await register('contrib', writeModule('contrib', [{ path: '/c/:name', tab: { group: 'prov:g', label: 'Chart' } }], { requires: { prov: '*' } }));
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.json().error).toContain('with the parameters [name] but its pages take [id]');
  });

  it('keeps the module that was registered when an update of it is refused: nothing disappears from the shell', async () => {
    await register('prov', writeModule('prov', PROVIDER_PAGES));
    expect((await register('contrib', writeModule('contrib', [{ path: '/c/:id', tab: { group: 'prov:g', label: 'Chart' } }], { requires: { prov: '*' } }))).statusCode).toBe(201);
    // The new version names a group the provider does not declare: refused.
    const refused = await register('contrib', writeModule('contrib', [{ path: '/c/:id', tab: { group: 'prov:nope', label: 'Chart' } }], { requires: { prov: '*' } }));
    expect(refused.statusCode).toBeGreaterThanOrEqual(400);
    const after = await listing();
    const contrib = after.modules.find((m) => m.id === 'contrib');
    expect(contrib?.extensionPoints[0]?.tab?.group).toBe('prov:g');
    // The refusal is visible (GET /api/modules, failed), the registry entry is unchanged, and the running version keeps serving.
    expect(after.failed.find((m) => m.id === 'contrib')?.error).toContain('declares no tab group "nope"');
    expect(refused.json().retained).toBe(false);
    expect(refused.json().error).toContain('version 1.0.0 of "contrib" keeps serving and its registry entry is unchanged');
  });

  it('with an optional provider: loads without it, the page waiting with its reason, and is active once the provider is there', async () => {
    const contrib = writeModule('contrib', [{ path: '/c/:id', tab: { group: 'prov:g', label: 'Chart' } }], { optionalRequires: { prov: '*' } });
    expect((await register('contrib', contrib)).statusCode).toBe(201);
    const waiting = (await listing()).modules.find((m) => m.id === 'contrib');
    expect(waiting?.extensionPoints[0]?.inactive).toContain('optional module "prov" is not available');
    expect(waiting?.warnings?.[0]).toContain('is inactive');

    await register('prov', writeModule('prov', PROVIDER_PAGES));
    expect((await listing()).modules.find((m) => m.id === 'contrib')?.extensionPoints[0]?.inactive).toBeUndefined();
  });

  it('with an optional provider that does not declare the group: inactive, with the reason', async () => {
    await register('prov', writeModule('prov', PROVIDER_PAGES));
    await register('contrib', writeModule('contrib', [{ path: '/c/:id', tab: { group: 'prov:nope', label: 'Chart' } }], { optionalRequires: { prov: '*' } }));
    expect((await listing()).modules.find((m) => m.id === 'contrib')?.extensionPoints[0]?.inactive).toContain('declares no tab group "nope"');
  });
});

describe('parseManifest: the group of another module', () => {
  const manifest = (group: string, extra: Record<string, unknown> = {}) => ({
    id: 'flow-chart',
    version: '1.0.0',
    backendEntryPath: './backend.mjs',
    extensionPoints: [{ kind: 'page', slot: 'route', label: 'Chart', path: '/flows/runs/:id', tab: { group, label: 'Chart' }, view: { type: 'inline', value: {} }, ...extra }],
  });
  const message = (input: unknown): string => {
    try {
      parseManifest(input);
    } catch (err) {
      return (err as ZodError).issues.map((i) => i.message).join(' | ');
    }
    return '';
  };

  it('accepts "<module>:<group>" on a single page: the other pages of the group are the provider\'s', () => {
    expect(() => parseManifest(manifest('flow:execution'))).not.toThrow();
  });

  it('refuses the id of the module itself as the provider, and says what to write', () => {
    expect(message(manifest('flow-chart:execution'))).toContain('names this very module');
    expect(message(manifest('flow-chart:execution'))).toContain('"group": "execution"');
  });

  it('refuses a malformed group', () => {
    for (const bad of ['flow:', ':execution', 'flow:Exec', 'flow:a:b', 'Exec Group']) {
      expect(message(manifest(bad)), bad).toContain('tab.group must be');
    }
  });
});
