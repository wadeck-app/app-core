import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildServer } from '../src/server.js';
import { writeRegistryEntry } from '../src/registry.js';
import { fixtureManifest } from './fixtureManifests.js';


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
      source: { type: 'file', path: fixtureManifest('app-module-minimal') },
    });

    const { server } = await buildServer({ configDir });

    const line = stderrLines.find((l) => l.includes('"ghost"'));
    expect(line).toContain(`failed to load from ${missingManifest}`);
    expect(line).toContain('POST /api/modules/unregister {"id":"ghost"}');

    const body = (await server.inject({ method: 'GET', url: '/api/modules' })).json() as FailedBody;
    expect(body.modules.map((m) => m.id)).toEqual(['module-a']);
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0]).toMatchObject({ id: 'ghost', source: missingManifest });
    expect(body.failed[0].error).toContain(`the manifest ${missingManifest} does not exist`);
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
    // The message blames the manifest file and its fields, not "Invalid payload" (the request itself was fine).
    const answer = res.json() as { error: string; issues: unknown[] };
    expect(answer.error).toMatch(/module "invalid": the manifest .*invalid-manifest\.json is invalid: .*backendEntryPath.*app-core-cli validate/s);
    expect(answer.error).not.toContain('Invalid payload');
    expect(answer.issues.length).toBeGreaterThan(0);

    // Refused before anything changed, for a module that was never registered: nothing is kept (decision 94).
    expect(res.json()).toMatchObject({ retained: false, cascaded: [], recovered: [] });
    expect(answer.error).toContain('Nothing was registered');
    const body = (await server.inject({ method: 'GET', url: '/api/modules' })).json() as FailedBody;
    expect(body.failed).toEqual([]);
    expect(fs.existsSync(path.join(configDir, 'modules', 'invalid.json'))).toBe(false);
    await server.close();
  });

  it('answers 400 naming the path and the fix for a manifest path that does not exist, and registers nothing', async () => {
    const { server } = await buildServer({ configDir });

    const bad = await server.inject({
      method: 'POST',
      url: '/api/modules/register',
      payload: { id: 'module-a', source: { type: 'file', path: missingManifest } },
    });
    expect(bad.statusCode).toBe(400);
    const answer = bad.json() as { error: string; retained: boolean };
    expect(answer.error).toContain(`the manifest ${missingManifest} does not exist`);
    expect(answer.error).toContain('Fix: register the absolute path of the packaged manifest');
    expect(answer.error).not.toContain('ENOENT');
    expect(answer.retained).toBe(false);
    expect(fs.existsSync(path.join(configDir, 'modules', 'module-a.json'))).toBe(false);
    expect(((await server.inject({ method: 'GET', url: '/api/modules' })).json() as FailedBody).failed).toEqual([]);
    await server.close();
  });

  it('answers 400 for a manifest file that is not JSON, naming the file', async () => {
    const notJson = path.join(configDir, 'not-json.json');
    fs.writeFileSync(notJson, '{ nope');
    const { server } = await buildServer({ configDir });
    const bad = await server.inject({ method: 'POST', url: '/api/modules/register', payload: { id: 'module-a', source: { type: 'file', path: notJson } } });
    expect(bad.statusCode).toBe(400);
    expect((bad.json() as { error: string }).error).toMatch(/the manifest .*not-json.json is not valid JSON.*app-core-cli package/);
    await server.close();
  });

  it('records a failed registration that is retained, and clears it once the same id loads successfully', async () => {
    const { server } = await buildServer({ configDir });

    // A requirement that is not met: the module stays registered and failed (decision 94).
    const bad = await server.inject({
      method: 'POST',
      url: '/api/modules/register',
      payload: { id: 'slot-contributor-a', source: { type: 'file', path: fixtureManifest('app-module-slot-contributor-a') } },
    });
    expect(bad.statusCode).toBe(422);
    expect(((await server.inject({ method: 'GET', url: '/api/modules' })).json() as FailedBody).failed.map((f) => f.id)).toEqual(['slot-contributor-a']);

    // Registering the same id again, now with its provider loaded, clears the failure.
    await server.inject({
      method: 'POST',
      url: '/api/modules/register',
      payload: { id: 'slot-provider', source: { type: 'file', path: fixtureManifest('app-module-slot-provider') } },
    });
    const good = await server.inject({
      method: 'POST',
      url: '/api/modules/register',
      payload: { id: 'slot-contributor-a', source: { type: 'file', path: fixtureManifest('app-module-slot-contributor-a') } },
    });
    expect(good.statusCode).toBe(201);
    const after = (await server.inject({ method: 'GET', url: '/api/modules' })).json() as FailedBody;
    expect(after.failed).toEqual([]);
    expect(after.modules.map((m) => m.id).sort()).toEqual(['slot-contributor-a', 'slot-provider']);
    await server.close();
  });
});
