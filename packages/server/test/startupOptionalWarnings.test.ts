import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveModulesDir } from '../src/configDir.js';
import { writeRegistryEntry } from '../src/registry.js';
import { buildServer } from '../src/server.js';

// At startup the registry loads in `requires` order, which says nothing about optional providers. A module that loaded before its
// optional provider used to be reported as missing it, in every log, although a moment later it was there.
describe('startup: the warnings about optional providers', () => {
  let configDir: string;
  let scratch: string;
  let written: string[];
  let closers: Array<() => Promise<void>> = [];

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-startup-optional-'));
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-startup-optional-modules-'));
    written = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const close of closers.splice(0)) {
      await close();
    }
    fs.rmSync(configDir, { recursive: true, force: true });
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  // Registers a packaged module: it offers the slot "panel" and contributes to "<other>:panel" if `contributesTo` is given.
  function register(id: string, optionalRequires: Record<string, string>, contributesTo?: string): void {
    const dir = path.join(scratch, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'backend.cjs'), 'module.exports = function () {};\n');
    const manifestPath = path.join(dir, 'manifest.json');
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        id,
        version: '1.0.0',
        backendEntryPath: './backend.cjs',
        optionalRequires,
        expose: { slots: { panel: { accepts: ['Badge'] } } },
        extensionPoints: [{ kind: 'widget', slot: contributesTo === undefined ? 'dashboard' : `${contributesTo}:panel`, view: { type: 'inline', value: { $type: 'Badge', label: id } } }],
      }),
    );
    writeRegistryEntry(resolveModulesDir(configDir), { id, source: { type: 'file', path: manifestPath } });
  }

  async function start(): Promise<void> {
    const { server } = await buildServer({ configDir, publicDir: path.join(scratch, 'none') });
    closers.push(() => server.close());
  }

  it('says nothing when the optional provider is in the registry but loads after the module that contributes to it', async () => {
    // "alpha" loads first (registry order) and contributes to "beta", which is not loaded yet at that moment.
    register('alpha', { beta: '*' }, 'beta');
    register('beta', { alpha: '*' }, 'alpha');
    await start();
    expect(written.join('')).not.toContain('is inactive');
  });

  it('says it once, after startup, when the optional provider is really not there', async () => {
    register('alpha', { ghost: '*' }, 'ghost');
    await start();
    const lines = written.join('').split('\n').filter((l) => l.includes('is inactive'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('module "alpha" extensionPoints[0] (slot "ghost:panel") is inactive: optional module "ghost" is not available');
  });
});
