import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildServer } from '../src/server.js';
import { writeRegistryEntry } from '../src/registry.js';
import { fixtureManifest } from './fixtureManifests.js';

type Json = Record<string, unknown>;

interface ModulesBody {
  modules: Array<{ id: string; extensionPoints: Array<{ kind: string; slot: string; label?: string; path?: string }> }>;
  failed: Array<{ id: string; error: string }>;
}

// A module copied from a packaged fixture, with its manifest edited, registered under its own id.
// The folder is named "dist-module" on purpose: vitest.config.ts only lets Node load a CommonJS bundle natively from such a path.
function addModule(configDir: string, id: string, edit: (manifest: Json) => void): void {
  const target = path.join(configDir, `copy-${id}`, 'dist-module');
  fs.cpSync(path.dirname(fixtureManifest('app-module-live-page')), target, { recursive: true });
  const manifestPath = path.join(target, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Json;
  manifest['id'] = id;
  edit(manifest);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  writeRegistryEntry(path.join(configDir, 'modules'), { id, source: { type: 'file', path: manifestPath } });
}

const chartPage = (overrides: Json = {}): Json => ({
  kind: 'page',
  slot: 'menu-provider:nav',
  label: 'Chart',
  path: '/chart',
  view: { type: 'inline', value: { $type: 'Badge', label: 'chart' } },
  ...overrides,
});

describe('a module adds a page to the side menu of the module it requires', () => {
  let configDir: string;

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-menu-'));
  });

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  const get = async (server: Awaited<ReturnType<typeof buildServer>>['server']): Promise<ModulesBody> =>
    (await server.inject({ method: 'GET', url: '/api/modules' })).json() as ModulesBody;

  it('loads both, and the API lists the contributed page with the slot, label and path the shell needs', async () => {
    addModule(configDir, 'menu-provider', () => {});
    addModule(configDir, 'menu-contrib', (m) => {
      m['requires'] = { 'menu-provider': '^1.0.0' };
      m['extensionPoints'] = [chartPage()];
    });
    const { server } = await buildServer({ configDir });
    const body = await get(server);
    expect(body.failed).toEqual([]);
    expect(body.modules.map((m) => m.id).sort()).toEqual(['menu-contrib', 'menu-provider']);
    const contrib = body.modules.find((m) => m.id === 'menu-contrib')!;
    expect(contrib.extensionPoints).toEqual([expect.objectContaining({ kind: 'page', slot: 'menu-provider:nav', label: 'Chart', path: '/chart' })]);
    await server.close();
  });

  it('needs no "expose" on the provider: the provider here declares none', async () => {
    addModule(configDir, 'menu-provider', (m) => {
      delete m['expose'];
    });
    addModule(configDir, 'menu-contrib', (m) => {
      m['requires'] = { 'menu-provider': '*' };
      m['extensionPoints'] = [chartPage()];
    });
    const { server } = await buildServer({ configDir });
    expect((await get(server)).failed).toEqual([]);
    await server.close();
  });

  it('refuses a contributor that does not require the provider, and says what to add', async () => {
    addModule(configDir, 'menu-provider', () => {});
    addModule(configDir, 'menu-contrib', (m) => {
      m['extensionPoints'] = [chartPage()];
    });
    const { server } = await buildServer({ configDir });
    const body = await get(server);
    expect(body.modules.map((m) => m.id)).toEqual(['menu-provider']);
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0].error).toContain('contributes to "menu-provider:nav" but "requires" does not list "menu-provider"');
    expect(body.failed[0].error).toContain('Fix: Add "requires": { "menu-provider":');
    await server.close();
  });

  it('refuses a contributor whose provider is not registered, naming it', async () => {
    addModule(configDir, 'menu-contrib', (m) => {
      m['requires'] = { 'menu-provider': '^1.0.0' };
      m['extensionPoints'] = [chartPage()];
    });
    const { server } = await buildServer({ configDir });
    const body = await get(server);
    expect(body.modules).toEqual([]);
    expect(body.failed[0].error).toContain('menu-provider');
    await server.close();
  });

  it('refuses a page with no path, naming the field and the fix, instead of an entry that goes nowhere', async () => {
    addModule(configDir, 'menu-provider', () => {});
    addModule(configDir, 'menu-contrib', (m) => {
      m['requires'] = { 'menu-provider': '^1.0.0' };
      m['extensionPoints'] = [chartPage({ path: undefined })];
    });
    const { server } = await buildServer({ configDir });
    const body = await get(server);
    expect(body.modules.map((m) => m.id)).toEqual(['menu-provider']);
    expect(body.failed[0].error).toContain('add a \\"path\\"');
    await server.close();
  });

  it('refuses a module that adds a page to its own "<id>:nav"', async () => {
    addModule(configDir, 'menu-provider', (m) => {
      m['extensionPoints'] = [chartPage({ slot: 'menu-provider:nav' })];
    });
    const { server } = await buildServer({ configDir });
    const body = await get(server);
    expect(body.failed[0].error).toContain('the side menu of this very module');
    expect(body.failed[0].error).toContain('Use slot "nav"');
    await server.close();
  });

  it('follows the provider: unregistering it sends the contributor to failed, so its entry leaves the menu', async () => {
    addModule(configDir, 'menu-provider', () => {});
    addModule(configDir, 'menu-contrib', (m) => {
      m['requires'] = { 'menu-provider': '^1.0.0' };
      m['extensionPoints'] = [chartPage()];
    });
    const { server } = await buildServer({ configDir });
    expect((await get(server)).modules).toHaveLength(2);

    const res = await server.inject({ method: 'POST', url: '/api/modules/unregister', payload: { id: 'menu-provider' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ removed: true, cascaded: ['menu-contrib'] });
    const after = await get(server);
    expect(after.modules).toEqual([]);
    expect(after.failed.map((f) => f.id)).toEqual(['menu-contrib']);
    await server.close();
  });
});
