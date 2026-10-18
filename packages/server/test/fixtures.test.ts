import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as url from 'node:url';
import { execFileSync } from 'node:child_process';
import { ModuleManager } from '../src/loader.js';
import { fixturesDir, scratchConfigDir } from './fixtureManifests.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const buildScript = path.join(__dirname, '..', '..', '..', 'scripts', 'build-fixtures.mjs');

// folder -> { id the manifest declares, version stamped by scripts/build-fixtures.mjs }
const EXPECTED: Record<string, { id: string; version: string }> = {
  'app-module-dsl-lib': { id: 'dsl-lib', version: '1.0.0' },
  'app-module-example': { id: 'example', version: '1.0.0' },
  'app-module-lifecycle': { id: 'module-b', version: '1.0.0' },
  'app-module-lifecycle-v2': { id: 'module-b', version: '2.0.0' },
  'app-module-live-page': { id: 'module-c', version: '1.0.0' },
  'app-module-live-widget': { id: 'module-d', version: '1.0.0' },
  'app-module-minimal': { id: 'module-a', version: '1.0.0' },
  'app-module-slot-contributor-a': { id: 'slot-contributor-a', version: '1.0.0' },
  'app-module-slot-contributor-b': { id: 'slot-contributor-b', version: '1.0.0' },
  'app-module-slot-provider': { id: 'slot-provider', version: '1.0.0' },
};

let outRoot: string;

// Packages every fixture with the real `package` implementation into a scratch folder, so this test never
// touches the dist-module folders the other tests use. The script itself fails when a fixture does not
// pass `check` or when an artifact is missing.
beforeAll(() => {
  outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-fixtures-'));
  try {
    execFileSync('node', [buildScript, '--out-root', outRoot], { encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    const failure = err as { stdout?: string; stderr?: string };
    throw new Error(`scripts/build-fixtures.mjs failed:\n${failure.stdout ?? ''}${failure.stderr ?? ''}`);
  }
}, 60_000);

afterAll(() => {
  fs.rmSync(outRoot, { recursive: true, force: true });
});

describe('test-app-modules fixtures', () => {
  it('every app-module-* folder is covered by this test (a new fixture must be added to EXPECTED)', () => {
    const folders = fs
      .readdirSync(fixturesDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('app-module-'))
      .map((e) => e.name)
      .sort();
    expect(folders).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(Object.entries(EXPECTED))('%s is packaged and loads in a real ModuleManager', async (folder, expected) => {
    const manifestPath = path.join(outRoot, folder, 'dist-module', 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manager = new ModuleManager({ configDir: scratchConfigDir() });
    try {
      // The modules it requires are loaded first, as the server does at startup.
      const required = Object.keys((JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { requires?: Record<string, string> }).requires ?? {});
      for (const id of required) {
        const providerFolder = Object.entries(EXPECTED).find(([, e]) => e.id === id)?.[0];
        if (providerFolder === undefined) {
          throw new Error(`${folder} requires "${id}", which no fixture provides: add the fixture to EXPECTED.`);
        }
        await manager.loadFromEntry({ id, source: { type: 'file', path: path.join(outRoot, providerFolder, 'dist-module', 'manifest.json') } });
      }
      const loaded = await manager.loadFromEntry({ id: expected.id, source: { type: 'file', path: manifestPath } });
      expect(loaded.manifest.id).toBe(expected.id);
      expect(loaded.manifest.version).toBe(expected.version);
      expect(manager.listFailed()).toEqual([]);
      expect(loaded.manifest.extensionPoints.length).toBeGreaterThan(0);
    } finally {
      for (const loaded of manager.list()) {
        await manager.unload(loaded.id);
      }
    }
  });

  it('the slot provider ships its types as dist-module/types/index.d.ts and exposes its slots', () => {
    const dist = path.join(outRoot, 'app-module-slot-provider', 'dist-module');
    const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.json'), 'utf8')) as { expose: unknown };
    expect(manifest.expose).toEqual({
      types: './types/index.d.ts',
      slots: { 'shared-slot': { accepts: ['Badge'] }, 'unused-slot': { accepts: ['Badge'] } },
    });
    expect(fs.readFileSync(path.join(dist, 'types', 'index.d.ts'), 'utf8')).toContain('export interface SharedSlotBadge');
  });

  it('dsl-lib ships its built components and stylesheet, with the nav, route, navbar and overlay points', async () => {
    const dist = path.join(outRoot, 'app-module-dsl-lib', 'dist-module');
    const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.json'), 'utf8')) as {
      extensionPoints: Array<{ kind: string; slot: string; path?: string }>;
      dslLib: { entry: string; css: string; shared: Record<string, string> };
    };
    expect(manifest.extensionPoints.map((ep) => `${ep.kind}:${ep.slot}`)).toEqual(['page:nav', 'page:route', 'widget:navbar', 'widget:overlay']);
    expect(manifest.extensionPoints[1]?.path).toBe('/items/:id');
    expect(manifest.dslLib.entry).toBe('./dsl-lib/entries.mjs');
    expect(manifest.dslLib.css).toBe('./dsl-lib/style.css');
    expect(manifest.dslLib.shared).toEqual({ react: '^19', 'react-router-dom': '^7', '@wadeck-app/dsl-ui': '>=2026.10.14-0' });
    const entries = fs.readFileSync(path.join(dist, 'dsl-lib', 'entries.mjs'), 'utf8');
    // The shared packages are read from the shell, never bundled.
    expect(entries).toContain('__APP_CORE_SHARED__');
    for (const name of ['Hello', 'RouteParam', 'NavbarStat', 'OverlayBox', 'Boom']) {
      expect(entries).toContain(`"${name}"`);
    }
  });

  it.each(['app-module-lifecycle', 'app-module-lifecycle-v2'])('%s ships its teardown and migrate hooks as bundled files', (folder) => {
    const dist = path.join(outRoot, folder, 'dist-module');
    const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.json'), 'utf8')) as { lifecycle: unknown };
    expect(manifest.lifecycle).toEqual({ teardown: './api-backend/teardown.cjs', migrate: './api-backend/migrate.cjs' });
    for (const hook of ['teardown', 'migrate']) {
      expect(fs.readFileSync(path.join(dist, 'api-backend', `${hook}.cjs`), 'utf8')).toContain('module.exports = module.exports.default;');
    }
  });

  it('the lifecycle v2 fixture keeps the id of v1 with a newer version and its own tick key', () => {
    const v1 = fs.readFileSync(path.join(fixturesDir, 'app-module-lifecycle', 'src', 'backend', 'index.ts'), 'utf8');
    const v2 = fs.readFileSync(path.join(fixturesDir, 'app-module-lifecycle-v2', 'src', 'backend', 'index.ts'), 'utf8');
    expect(v1).toContain("ticks['v1']");
    expect(v2).toContain("ticks['v2']");
    expect(EXPECTED['app-module-lifecycle']?.id).toBe(EXPECTED['app-module-lifecycle-v2']?.id);
  });
});
