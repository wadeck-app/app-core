import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildServer } from '../src/server.js';
import { writeRegistryEntry } from '../src/registry.js';
import { fixtureManifest } from './fixtureManifests.js';

interface ModulesBody {
  modules: Array<{ id: string; showInNav: boolean; extensionPoints: unknown[] }>;
}

// A copy of a packaged fixture whose manifest says `showInNav`, so the real loader and the real route are exercised.
function copyFixtureWith(configDir: string, fixture: string, id: string, showInNav: unknown): string {
  const sourceDir = path.dirname(fixtureManifest(fixture));
  // Named "dist-module" on purpose: vitest.config.ts only lets Node load a CommonJS bundle natively from such a path;
  // anywhere else vitest wraps it and the default export is no longer the function (see exampleModule.test.ts).
  const target = path.join(configDir, `copy-${id}`, 'dist-module');
  fs.cpSync(sourceDir, target, { recursive: true });
  const manifestPath = path.join(target, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  manifest['id'] = id;
  if (showInNav !== undefined) manifest['showInNav'] = showInNav;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifestPath;
}

describe('GET /api/modules: showInNav', () => {
  let configDir: string;

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-shownav-'));
  });

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  it('reports false for a module that says so, and true for one that says nothing or true (the shell never has to guess)', async () => {
    const modules = path.join(configDir, 'modules');
    writeRegistryEntry(modules, { id: 'hidden-one', source: { type: 'file', path: copyFixtureWith(configDir, 'app-module-minimal', 'hidden-one', false) } });
    writeRegistryEntry(modules, { id: 'silent-one', source: { type: 'file', path: copyFixtureWith(configDir, 'app-module-minimal', 'silent-one', undefined) } });
    writeRegistryEntry(modules, { id: 'listed-one', source: { type: 'file', path: copyFixtureWith(configDir, 'app-module-minimal', 'listed-one', true) } });

    const { server } = await buildServer({ configDir });
    const body = (await server.inject({ method: 'GET', url: '/api/modules' })).json() as ModulesBody & { failed: unknown[] };
    const flags = Object.fromEntries(body.modules.map((m) => [m.id, m.showInNav]));
    expect(flags, `failed: ${JSON.stringify(body.failed)}`).toEqual({ 'hidden-one': false, 'silent-one': true, 'listed-one': true });
    await server.close();
  });

  it('still serves the views of a module that is not listed: hiding it from the navigation does not unload it', async () => {
    const modules = path.join(configDir, 'modules');
    writeRegistryEntry(modules, { id: 'hidden-one', source: { type: 'file', path: copyFixtureWith(configDir, 'app-module-minimal', 'hidden-one', false) } });
    const { server } = await buildServer({ configDir });
    const body = (await server.inject({ method: 'GET', url: '/api/modules' })).json() as ModulesBody;
    expect(body.modules).toHaveLength(1);
    expect(body.modules[0].extensionPoints.length).toBeGreaterThan(0);
    await server.close();
  });

  it('fails to load a module whose showInNav is not a boolean, and says why (listed under failed)', async () => {
    const modules = path.join(configDir, 'modules');
    writeRegistryEntry(modules, { id: 'bad-one', source: { type: 'file', path: copyFixtureWith(configDir, 'app-module-minimal', 'bad-one', 'false') } });
    const { server } = await buildServer({ configDir });
    const body = (await server.inject({ method: 'GET', url: '/api/modules' })).json() as ModulesBody & { failed: Array<{ id: string; error: string }> };
    expect(body.modules).toEqual([]);
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0].id).toBe('bad-one');
    expect(body.failed[0].error).toMatch(/showInNav/);
    await server.close();
  });
});
