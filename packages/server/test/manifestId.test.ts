import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseManifest, parseSourceManifest } from '../src/manifest.js';
import { ModuleManager } from '../src/loader.js';
import { scratchConfigDir } from './fixtureManifests.js';
import { buildServer } from '../src/server.js';

const widget = { kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: { $type: 'Badge', label: 'x' } } };

describe('manifest id (decision 83)', () => {
  it('requires an id', () => {
    expect(() => parseManifest({ version: '1.0.0', backendEntryPath: './b.cjs', extensionPoints: [widget] })).toThrow(/id/);
  });

  it('applies the module id charset', () => {
    for (const id of ['a/b', '../x', '.hidden', 'a b', '']) {
      expect(() => parseManifest({ id, version: '1.0.0', backendEntryPath: './b.cjs', extensionPoints: [widget] })).toThrow(
        /id/,
      );
    }
    const ok = parseManifest({ id: 'queue-2_x', version: '1.0.0', backendEntryPath: './b.cjs', extensionPoints: [widget] });
    expect(ok.id).toBe('queue-2_x');
  });
});

describe('source manifest', () => {
  it('accepts id, extensionPoints and dslLib.shared only', () => {
    const parsed = parseSourceManifest({ id: 'queue', extensionPoints: [widget], dslLib: { shared: { react: '^19.0.0' } } });
    expect(parsed.dslLib?.shared).toEqual({ react: '^19.0.0' });
  });

  it('defaults dslLib.shared to an empty record', () => {
    expect(parseSourceManifest({ id: 'queue', extensionPoints: [widget], dslLib: {} }).dslLib?.shared).toEqual({});
  });

  it('rejects the output-only keys', () => {
    for (const extra of [{ version: '1.0.0' }, { backendEntryPath: './x.ts' }]) {
      expect(() => parseSourceManifest({ id: 'queue', extensionPoints: [widget], ...extra })).toThrow(/Unrecognized key/);
    }
    expect(() => parseSourceManifest({ id: 'queue', extensionPoints: [widget], dslLib: { entry: './dsl-lib/e.mjs' } })).toThrow(
      /Unrecognized key/,
    );
  });

  it('requires an id', () => {
    expect(() => parseSourceManifest({ extensionPoints: [widget] })).toThrow(/id/);
  });
});

describe('ModuleManager refuses an unusable registration', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-manifest-id-'));
    fs.mkdirSync(path.join(dir, 'api-backend'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeModule(manifestId: string, backendSource: string): string {
    fs.writeFileSync(path.join(dir, 'api-backend', 'backend.mjs'), backendSource);
    const manifestPath = path.join(dir, 'manifest.json');
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({ id: manifestId, version: '1.0.0', backendEntryPath: './api-backend/backend.mjs', extensionPoints: [widget] }),
    );
    return manifestPath;
  }

  it('a registration id that differs from manifest.id is refused with both ids and the fix, and listed as failed', async () => {
    const manifestPath = writeModule('queue', 'export default function () {}\n');
    const manager = new ModuleManager({ configDir: scratchConfigDir() });
    await expect(manager.loadFromEntry({ id: 'other', source: { type: 'file', path: manifestPath } })).rejects.toThrow(
      /"other".*"queue"/s,
    );
    expect(manager.get('other')).toBeUndefined();
    const failed = manager.listFailed();
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toContain(manifestPath);
    expect(failed[0].error).toMatch(/register it as "queue"|"id"/);
  });

  it('HTTP register answers 400 with the actionable message on an id mismatch', async () => {
    const manifestPath = writeModule('queue', 'export default function () {}\n');
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-manifest-id-cfg-'));
    try {
      const { server } = await buildServer({ configDir });
      const res = await server.inject({
        method: 'POST',
        url: '/api/modules/register',
        payload: { id: 'other', source: { type: 'file', path: manifestPath } },
      });
      expect(res.statusCode).toBe(400);
      expect((res.json() as { error: string }).error).toMatch(/"other".*"queue"/s);
      await server.close();
    } finally {
      fs.rmSync(configDir, { recursive: true, force: true });
    }
  });

  it('a backend without a function default export fails loudly instead of being skipped', async () => {
    for (const source of ['export const nothing = 1;\n', 'export default { notAFunction: true };\n']) {
      const manifestPath = writeModule('noop', source);
      const manager = new ModuleManager({ configDir: scratchConfigDir() });
      await expect(manager.loadFromEntry({ id: 'noop', source: { type: 'file', path: manifestPath } })).rejects.toThrow(
        /default-export a function/,
      );
      expect(manager.get('noop')).toBeUndefined();
      expect(manager.listFailed()[0].error).toMatch(/must default-export a function/);
      expect(manager.listFailed()[0].error).toContain('api-backend');
    }
  });
});
