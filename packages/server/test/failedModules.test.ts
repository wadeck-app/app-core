import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as url from 'node:url';
import { buildServer } from '../src/server.js';
import { writeRegistryEntry } from '../src/registry.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '..', '..', 'test-app-modules');

interface FailedBody {
  modules: Array<{ id: string }>;
  failed: Array<{ id: string; source: string; error: string; failedAt: string }>;
}

describe('modules that fail to load', () => {
  let configDir: string;
  let missingManifest: string;
  let stderrLines: string[];

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-failed-'));
    missingManifest = path.join(configDir, 'does-not-exist', 'manifest.json');
    stderrLines = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stderrLines.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  it('startup survives a broken registry entry, prints an actionable stderr line and lists it under failed', async () => {
    writeRegistryEntry(path.join(configDir, 'modules'), { id: 'ghost', source: { type: 'file', path: missingManifest } });
    writeRegistryEntry(path.join(configDir, 'modules'), {
      id: 'module-a',
      source: { type: 'file', path: path.join(fixturesDir, 'app-module-minimal', 'manifest.json') },
    });

    const { server } = await buildServer({ configDir });

    const line = stderrLines.find((l) => l.includes('"ghost"'));
    expect(line).toContain(`failed to load from ${missingManifest}`);
    expect(line).toContain('POST /api/modules/unregister {"id":"ghost"}');

    const body = (await server.inject({ method: 'GET', url: '/api/modules' })).json() as FailedBody;
    expect(body.modules.map((m) => m.id)).toEqual(['module-a']);
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0]).toMatchObject({ id: 'ghost', source: missingManifest });
    expect(body.failed[0].error).toContain('ENOENT');
    expect(Number.isNaN(Date.parse(body.failed[0].failedAt))).toBe(false);
    await server.close();
  });

  it('reports a manifest that exists but is invalid, with the validation reason', async () => {
    const invalid = path.join(configDir, 'invalid-manifest.json');
    fs.writeFileSync(invalid, JSON.stringify({ version: '1.0.0' }));
    const { server } = await buildServer({ configDir });

    const res = await server.inject({
      method: 'POST',
      url: '/api/modules/register',
      payload: { id: 'invalid', source: { type: 'file', path: invalid } },
    });
    expect(res.statusCode).toBe(400);

    const body = (await server.inject({ method: 'GET', url: '/api/modules' })).json() as FailedBody;
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0]).toMatchObject({ id: 'invalid', source: invalid });
    expect(body.failed[0].error).toContain('backendEntryPath');
    await server.close();
  });

  it('records a failed runtime registration and clears it once the same id loads successfully', async () => {
    const { server } = await buildServer({ configDir });

    const bad = await server.inject({
      method: 'POST',
      url: '/api/modules/register',
      payload: { id: 'late', source: { type: 'file', path: missingManifest } },
    });
    expect(bad.statusCode).toBe(500);
    expect(((await server.inject({ method: 'GET', url: '/api/modules' })).json() as FailedBody).failed.map((f) => f.id)).toEqual(['late']);

    const good = await server.inject({
      method: 'POST',
      url: '/api/modules/register',
      payload: { id: 'late', source: { type: 'file', path: path.join(fixturesDir, 'app-module-minimal', 'manifest.json') } },
    });
    expect(good.statusCode).toBe(201);
    const after = (await server.inject({ method: 'GET', url: '/api/modules' })).json() as FailedBody;
    expect(after.failed).toEqual([]);
    expect(after.modules.map((m) => m.id)).toEqual(['late']);
    await server.close();
  });
});
