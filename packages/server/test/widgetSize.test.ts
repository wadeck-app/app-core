import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ZodError } from 'zod';
import { buildServer } from '../src/server.js';
import { writeRegistryEntry } from '../src/registry.js';
import { parseManifest, parseSourceManifest } from '../src/manifest.js';
import { fixtureManifest } from './fixtureManifests.js';

const widget = (extra: Record<string, unknown> = {}) => ({
  kind: 'widget',
  slot: 'dashboard',
  view: { type: 'inline', value: { $type: 'Badge', label: 'x' } },
  ...extra,
});
const parse = (extensionPoints: unknown[]) => parseSourceManifest({ id: 'sized', extensionPoints });

// The messages the author reads, one per problem (a thrown ZodError prints as escaped JSON).
function problemsOf(fn: () => unknown): string[] {
  try {
    fn();
  } catch (err) {
    if (err instanceof ZodError) {
      return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    }
    throw err;
  }
  return [];
}

describe('widget size (width and height, in dashboard grid cells)', () => {
  it('accepts 1 to 12 for each, together or alone, and none at all', () => {
    for (const value of [1, 2, 4, 12]) {
      expect(parse([widget({ width: value, height: value })]).extensionPoints[0]).toMatchObject({ width: value, height: value });
    }
    expect(parse([widget({ width: 2 })]).extensionPoints[0]).toMatchObject({ width: 2 });
    expect(parse([widget()]).extensionPoints[0]).not.toHaveProperty('width');
  });

  it('rejects 0, 13, a fraction and a string, naming the field and the range', () => {
    for (const value of [0, 13, 1.5, '2', null]) {
      const problems = problemsOf(() => parse([widget({ width: value })]));
      expect(problems.some((p) => p.startsWith('extensionPoints.0.width:')), String(value)).toBe(true);
    }
    expect(problemsOf(() => parse([widget({ height: 13 })]))).toEqual(['extensionPoints.0.height: must be between 1 and 12']);
  });

  it('is refused outside a dashboard widget, where it would be silently ignored, with the fix', () => {
    const page = problemsOf(() => parse([{ kind: 'page', slot: 'nav', label: 'P', width: 2, view: { type: 'inline', value: {} } }]));
    expect(page).toEqual([expect.stringContaining('"width" only sizes a widget on the dashboard (kind "widget", slot "dashboard"); this is kind "page" on slot "nav"')]);
    const navbar = problemsOf(() => parse([widget({ slot: 'navbar', height: 2 })]));
    expect(navbar).toEqual([expect.stringContaining('this is kind "widget" on slot "navbar". Remove it')]);
  });

  it('is enforced on the packaged manifest too', () => {
    const packaged = (extensionPoints: unknown[]) => parseManifest({ id: 'sized', version: '1.0.0', backendEntryPath: './b.cjs', extensionPoints });
    expect(() => packaged([widget({ width: 3 })])).not.toThrow();
    expect(problemsOf(() => packaged([widget({ width: 20 })]))).toHaveLength(1);
  });
});

describe('GET /api/modules: widget size', () => {
  let configDir: string;

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-size-'));
  });

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  it('gives the shell the size the manifest declares, and nothing for a widget that declares none', async () => {
    // The folder is named "dist-module": vitest only lets Node load the CommonJS bundle natively from such a path.
    const target = path.join(configDir, 'copy', 'dist-module');
    fs.cpSync(path.dirname(fixtureManifest('app-module-minimal')), target, { recursive: true });
    const manifestPath = path.join(target, 'manifest.json');
    const manifest: Record<string, unknown> = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest['id'] = 'sized';
    manifest['extensionPoints'] = [
      widget({ label: 'Big', width: 3, height: 2 }),
      widget({ label: 'Plain' }),
    ];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    writeRegistryEntry(path.join(configDir, 'modules'), { id: 'sized', source: { type: 'file', path: manifestPath } });

    const { server } = await buildServer({ configDir });
    const body = (await server.inject({ method: 'GET', url: '/api/modules' })).json() as { modules: Array<{ extensionPoints: Array<{ label?: string; width?: number; height?: number }> }>; failed: unknown[] };
    expect(body.failed).toEqual([]);
    const sizes = Object.fromEntries(body.modules[0].extensionPoints.map((ep) => [ep.label, [ep.width, ep.height]]));
    expect(sizes).toEqual({ Big: [3, 2], Plain: [undefined, undefined] });
    await server.close();
  });
});
