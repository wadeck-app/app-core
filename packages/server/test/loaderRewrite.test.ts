import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ModuleManager } from '../src/loader.js';

declare global {
  // eslint-disable-next-line no-var
  var __loaderRewriteTestMarker: string | undefined;
}


describe('ModuleManager.loadFromEntry when the backend is rewritten without a version bump', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-rewrite-'));
    fs.mkdirSync(path.join(dir, 'api-backend'));
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({
        version: '1.0.0',
        backendEntryPath: './api-backend/backend.mjs',
        extensionPoints: [
          { kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: { $type: 'Badge', label: 'x' } } },
        ],
      }),
    );
  });

  afterEach(() => {
    globalThis.__loaderRewriteTestMarker = undefined;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeBackend(value: string): void {
    fs.writeFileSync(
      path.join(dir, 'api-backend', 'backend.mjs'),
      `export default function () { globalThis.__loaderRewriteTestMarker = '${value}'; }\n`,
    );
  }

  it('runs the new backend code on the second load, with the same manifest version', async () => {
    const manager = new ModuleManager();
    const entry = { id: 'rewrite', source: { type: 'file' as const, path: path.join(dir, 'manifest.json') } };

    writeBackend('first');
    await manager.loadFromEntry(entry);
    expect(globalThis.__loaderRewriteTestMarker).toBe('first');

    writeBackend('second-longer');
    await manager.loadFromEntry(entry);
    expect(globalThis.__loaderRewriteTestMarker).toBe('second-longer');
  });
});
