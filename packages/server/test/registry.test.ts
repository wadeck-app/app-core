import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { writeRegistryEntry, readRegistryEntries } from '../src/registry.js';

describe('registry read/write round-trip', () => {
  let modulesDir: string;

  beforeEach(() => {
    modulesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-registry-'));
  });

  afterEach(() => {
    fs.rmSync(modulesDir, { recursive: true, force: true });
  });

  it('returns an empty list when the directory does not exist yet', () => {
    const missingDir = path.join(modulesDir, 'does-not-exist');
    expect(readRegistryEntries(missingDir)).toEqual([]);
  });

  it('writes an entry and reads it back unchanged', () => {
    writeRegistryEntry(modulesDir, { id: 'queue', source: { type: 'file', path: '/abs/manifest.json' } });
    const entries = readRegistryEntries(modulesDir);
    expect(entries).toEqual([{ id: 'queue', source: { type: 'file', path: '/abs/manifest.json' } }]);
  });

  it('overwrites an existing entry for the same id instead of duplicating it', () => {
    writeRegistryEntry(modulesDir, { id: 'queue', source: { type: 'file', path: '/v1/manifest.json' } });
    writeRegistryEntry(modulesDir, { id: 'queue', source: { type: 'file', path: '/v2/manifest.json' } });
    const entries = readRegistryEntries(modulesDir);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.source.path).toBe('/v2/manifest.json');
  });

  it('reads multiple distinct module entries', () => {
    writeRegistryEntry(modulesDir, { id: 'queue', source: { type: 'file', path: '/queue/manifest.json' } });
    writeRegistryEntry(modulesDir, { id: 'orchestrator', source: { type: 'file', path: '/orch/manifest.json' } });
    const entries = readRegistryEntries(modulesDir);
    expect(entries.map((e) => e.id).sort()).toEqual(['orchestrator', 'queue']);
  });
});
