import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildServer, type AppCoreServer } from '../src/server.js';
import { readRegistryEntries } from '../src/registry.js';
import { resetModuleLog, writeTestModule, type TestModuleSpec } from './moduleFactory.js';

// Decision 94: what a register/update that does not succeed leaves behind, and what the answer says about it.
// - a requirement that is not met: the module stays registered and failed (retained: true), retried automatically;
// - the running version was torn down and the new one did not start: kept too, but not retried;
// - anything refused before anything changed: nothing is kept (a new module leaves no registry entry; an
//   existing module keeps its entry and its running version).

interface Answer {
  error?: string;
  retained?: boolean;
  cascaded?: string[];
  recovered?: string[];
}

describe('registration outcome: retained or not', () => {
  let configDir: string;
  let scratch: string;
  let app: AppCoreServer;

  beforeEach(async () => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-outcome-'));
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-outcome-mods-'));
    resetModuleLog();
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    app = await buildServer({ configDir });
  });

  afterEach(async () => {
    await app.server.close();
    vi.restoreAllMocks();
    fs.rmSync(configDir, { recursive: true, force: true });
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  const write = (id: string, spec: TestModuleSpec = {}): string => writeTestModule(scratch, id, spec);
  const registryPaths = (): Record<string, string> => Object.fromEntries(readRegistryEntries(path.join(configDir, 'modules')).map((e) => [e.id, e.source.path]));

  async function post(action: 'register' | 'update', id: string, manifestPath: string): Promise<{ status: number; body: Answer }> {
    const res = await app.server.inject({ method: 'POST', url: `/api/modules/${action}`, payload: { id, source: { type: 'file', path: manifestPath } } });
    return { status: res.statusCode, body: res.json<Answer>() };
  }

  describe('recoverable: a requirement is not met', () => {
    it('keeps the registration for a new module, says so, and lists it as failed with its cause', async () => {
      const manifest = write('b', { requires: { a: '*' } });
      const res = await post('register', 'b', manifest);

      expect(res.status).toBe(422);
      expect(res.body.retained).toBe(true);
      expect(res.body.error).toContain('module "a" is not loaded');
      expect(res.body.error).toContain('The registration is kept: "b" stays registered and failed, and is loaded automatically');
      expect(registryPaths()).toEqual({ b: manifest });
      const listing = (await app.server.inject({ method: 'GET', url: '/api/modules' })).json<{ failed: Array<{ id: string; cause: string }> }>();
      expect(listing.failed).toEqual([expect.objectContaining({ id: 'b', cause: 'requirement' })]);
    });

    it('the kept registration survives a restart and is retried there', async () => {
      await post('register', 'b', write('b', { requires: { a: '*' } }));
      await app.server.close();

      app = await buildServer({ configDir });
      expect(app.manager.listFailed()).toEqual([expect.objectContaining({ id: 'b', cause: 'requirement' })]);
      const back = await post('register', 'a', write('a'));
      expect(back.body.recovered).toEqual(['b']);
    });

    it('an update of a RUNNING module that needs a missing module is refused: old version serves, entry unchanged, not retained', async () => {
      const manifest = write('m');
      await post('register', 'm', manifest);
      write('m', { version: '2.0.0', requires: { missing: '*' } });

      const res = await post('update', 'm', manifest);

      expect(res.status).toBe(422);
      expect(res.body.retained).toBe(false);
      expect(res.body.error).toContain('version 1.0.0 of "m" keeps serving and its registry entry is unchanged');
      expect(app.manager.get('m')?.manifest.version).toBe('1.0.0');
    });
  });

  describe('non-recoverable: refused before anything changed', () => {
    it('invalid manifest: a new module leaves no registry entry and no failure record', async () => {
      const manifest = write('m');
      fs.writeFileSync(manifest, JSON.stringify({ id: 'm' }));

      const res = await post('register', 'm', manifest);

      expect(res.status).toBe(400);
      expect(res.body.retained).toBe(false);
      expect(res.body.error).toContain('Nothing was registered: "m" has no registry entry');
      expect(registryPaths()).toEqual({});
      expect(app.manager.listFailed()).toEqual([]);
    });

    it('id mismatch: a new module leaves no registry entry', async () => {
      const res = await post('register', 'other', write('m'));

      expect(res.status).toBe(400);
      expect(res.body.retained).toBe(false);
      expect(registryPaths()).toEqual({});
    });

    it('missing backend file: a new module leaves no registry entry', async () => {
      const manifest = write('m');
      fs.rmSync(path.join(path.dirname(manifest), 'backend.mjs'));

      const res = await post('register', 'm', manifest);

      expect(res.status).toBe(500);
      expect(res.body.retained).toBe(false);
      expect(res.body.error).toContain('does not exist');
      expect(registryPaths()).toEqual({});
    });

    it('a manifest path that does not exist answers 400 naming the path and the fix', async () => {
      const missing = path.join(scratch, 'nope', 'manifest.json');
      const res = await post('register', 'm', missing);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain(`the manifest ${missing} does not exist`);
      expect(res.body.error).toContain('Fix: register the absolute path of the packaged manifest');
      expect(res.body.error).not.toContain('ENOENT');
      expect(registryPaths()).toEqual({});
    });

    it('an existing module keeps its entry (and its OLD path) and its running version when an update is refused', async () => {
      const first = write('m');
      await post('register', 'm', first);
      const other = path.join(scratch, 'elsewhere');
      fs.mkdirSync(other);
      const broken = path.join(other, 'manifest.json');
      fs.writeFileSync(broken, JSON.stringify({ id: 'm', version: '2.0.0' }));

      const res = await post('update', 'm', broken);

      expect(res.status).toBe(400);
      expect(res.body.retained).toBe(false);
      expect(res.body.error).toContain('keeps serving and its registry entry is unchanged');
      expect(registryPaths()).toEqual({ m: first });
      expect(app.manager.get('m')?.manifest.version).toBe('1.0.0');
    });

    it('a registered-and-failed module re-registered with an invalid manifest keeps its entry', async () => {
      const b = write('b', { requires: { a: '*' } });
      await post('register', 'b', b);
      const broken = path.join(scratch, 'broken.json');
      fs.writeFileSync(broken, '{}');

      const res = await post('update', 'b', broken);

      expect(res.body.retained).toBe(false);
      expect(res.body.error).toContain('the registry entry of "b" is unchanged');
      expect(registryPaths()).toEqual({ b });
    });
  });

  describe('the module was torn down and the new version did not start', () => {
    it('keeps the registration, says it is not retried automatically, and a later good registration replaces it', async () => {
      const manifest = write('m');
      await post('register', 'm', manifest);
      write('m', { version: '2.0.0', backend: "export default function () { throw new Error('boom'); }\n" });

      const res = await post('update', 'm', manifest);

      expect(res.status).toBe(500);
      expect(res.body.retained).toBe(true);
      expect(res.body.error).toContain('boom');
      expect(res.body.error).toContain('not retried automatically');
      expect(app.manager.listFailed()).toEqual([expect.objectContaining({ id: 'm', cause: 'error' })]);
      expect(registryPaths()).toEqual({ m: manifest });

      write('m', { version: '2.1.0' });
      expect((await post('update', 'm', manifest)).status).toBe(200);
      expect(app.manager.listFailed()).toEqual([]);
    });
  });
});
