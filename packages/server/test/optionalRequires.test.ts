import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ZodError } from 'zod';
import { buildServer } from '../src/server.js';
import { parseManifest, parseSourceManifest } from '../src/manifest.js';

type Built = Awaited<ReturnType<typeof buildServer>>;

interface Listing {
  modules: Array<{ id: string; warnings?: string[]; extensionPoints: Array<{ slot: string; inactive?: string }> }>;
  failed: Array<{ id: string; error: string; cause?: string }>;
}

describe('optionalRequires: contributions to modules a module can do without', () => {
  let configDir: string;
  let scratch: string;
  let warnings: string[];
  let server: Built['server'];

  beforeEach(async () => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-optional-'));
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-optional-modules-'));
    warnings = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      warnings.push(String(chunk));
      return true;
    });
    server = (await buildServer({ configDir, publicDir: path.join(scratch, 'none') })).server;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await server.close();
    fs.rmSync(configDir, { recursive: true, force: true });
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  // A hand-written packaged module: one extension point per contribution, a no-op backend.
  function writeModule(
    id: string,
    extra: {
      version?: string;
      requires?: Record<string, string>;
      optionalRequires?: Record<string, string>;
      expose?: unknown;
      points?: Array<{ slot: string; view: Record<string, unknown> }>;
    } = {},
  ): string {
    const dir = path.join(scratch, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'backend.cjs'), 'module.exports = function () {};\n');
    const points = extra.points ?? [{ slot: 'dashboard', view: { $type: 'Badge', label: id } }];
    const manifest = {
      id,
      version: extra.version ?? '1.0.0',
      backendEntryPath: './backend.cjs',
      ...(extra.requires === undefined ? {} : { requires: extra.requires }),
      ...(extra.optionalRequires === undefined ? {} : { optionalRequires: extra.optionalRequires }),
      ...(extra.expose === undefined ? {} : { expose: extra.expose }),
      extensionPoints: points.map((p) => ({ kind: 'widget', slot: p.slot, view: { type: 'inline', value: p.view } })),
    };
    const manifestPath = path.join(dir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    return manifestPath;
  }

  const register = (id: string, manifestPath: string) => server.inject({ method: 'POST', url: '/api/modules/register', payload: { id, source: { type: 'file', path: manifestPath } } });
  const unregister = (id: string) => server.inject({ method: 'POST', url: '/api/modules/unregister', payload: { id } });
  const listing = async (): Promise<Listing> => (await server.inject({ method: 'GET', url: '/api/modules' })).json() as Listing;
  const slot = async (slotId: string): Promise<unknown[]> => (await server.inject({ method: 'GET', url: `/api/slots/${slotId}` })).json() as unknown[];
  const moduleOf = async (id: string) => (await listing()).modules.find((m) => m.id === id);

  // `proj` offers a slot "header" (Badge only) and can do without `tsk`; `tsk` can do without `proj`. Each contributes to the other.
  const projManifest = () =>
    writeModule('proj', {
      expose: { slots: { header: { accepts: ['Badge'] } } },
      optionalRequires: { tsk: '*' },
      points: [{ slot: 'tsk:panel', view: { $type: 'Badge', label: 'from-proj' } }],
    });
  const tskManifest = (view: Record<string, unknown> = { $type: 'Badge', label: 'from-tsk' }, optionalRequires: Record<string, string> = { proj: '*' }) =>
    writeModule('tsk', {
      expose: { slots: { panel: { accepts: ['Badge'] } } },
      optionalRequires,
      points: [{ slot: 'proj:header', view }],
    });

  it('loads without the provider, says so in the answer of GET /api/modules, and serves nothing of that contribution', async () => {
    expect((await register('tsk', tskManifest())).statusCode).toBe(201);

    const tsk = await moduleOf('tsk');
    expect(tsk).toBeDefined();
    expect(tsk?.extensionPoints[0]?.inactive).toContain('optional module "proj" is not available');
    expect(tsk?.warnings).toEqual([expect.stringContaining('extensionPoints[0] (slot "proj:header") is inactive: optional module "proj" is not available')]);
    expect(await slot('proj:header')).toEqual([]);
    // Never silent: the log says it too, once, when the module loads.
    expect(warnings.join('')).toContain('module "tsk" extensionPoints[0] (slot "proj:header") is inactive');
  });

  it('activates the contribution when the provider loads, and drops it again when the provider goes, with no cascade', async () => {
    await register('tsk', tskManifest());
    expect((await register('proj', projManifest())).statusCode).toBe(201);

    expect((await moduleOf('tsk'))?.extensionPoints[0]?.inactive).toBeUndefined();
    expect((await moduleOf('tsk'))?.warnings).toBeUndefined();
    expect(await slot('proj:header')).toEqual([{ $type: 'Badge', label: 'from-tsk' }]);

    expect((await unregister('proj')).statusCode).toBe(200);
    const tsk = await moduleOf('tsk');
    expect(tsk, 'the optional dependent stays loaded').toBeDefined();
    expect(tsk?.extensionPoints[0]?.inactive).toBeDefined();
    expect(await slot('proj:header')).toEqual([]);
    expect((await listing()).failed).toEqual([]);
  });

  it('lets two modules contribute to each other: no cycle, in either order, both active once both are loaded', async () => {
    expect((await register('proj', projManifest())).statusCode).toBe(201);
    expect((await register('tsk', tskManifest())).statusCode).toBe(201);

    expect((await listing()).failed).toEqual([]);
    expect(await slot('proj:header')).toEqual([{ $type: 'Badge', label: 'from-tsk' }]);
    expect(await slot('tsk:panel')).toEqual([{ $type: 'Badge', label: 'from-proj' }]);
    expect((await moduleOf('proj'))?.warnings).toBeUndefined();
  });

  it('keeps a contribution inactive, with the reason, when the provider is there and the contract does not hold; the module still loads', async () => {
    await register('proj', projManifest());
    const res = await register('tsk', tskManifest({ $type: 'Card', title: 'x' }));
    expect(res.statusCode).toBe(201);

    const tsk = await moduleOf('tsk');
    expect(tsk?.extensionPoints[0]?.inactive).toContain('contributes a "Card" to "proj:header", which accepts only: Badge');
    expect(await slot('proj:header')).toEqual([]);
  });

  it('keeps it inactive when the provider version is outside the range', async () => {
    await register('proj', projManifest());
    expect((await register('tsk', tskManifest(undefined, { proj: '^2.0.0' }))).statusCode).toBe(201);
    expect((await moduleOf('tsk'))?.extensionPoints[0]?.inactive).toContain('version 1.0.0 of "proj" is loaded');
  });

  it('still fails a module that contributes to a module it lists nowhere, and the fix names both keys', async () => {
    const manifest = writeModule('lone', { points: [{ slot: 'proj:header', view: { $type: 'Badge', label: 'x' } }] });
    const res = await register('lone', manifest);
    expect(res.statusCode).toBe(422);
    expect((res.json() as { error: string }).error).toContain('"optionalRequires" if this module can work without proj');
  });

  it('does not let a hard requires cycle through: it is still refused', async () => {
    const a = writeModule('a', { requires: { b: '*' } });
    const b = writeModule('b', { requires: { a: '*' } });
    // `a` cannot load before `b`, and `b` not before `a`: neither ever loads (the message of a cycle itself is tested at startup).
    expect((await register('a', a)).statusCode).toBe(422);
    expect((await register('b', b)).statusCode).toBe(422);
    expect((await listing()).modules).toEqual([]);
  });
});

describe('optionalRequires in the manifest', () => {
  const base = { id: 'm', version: '1.0.0', backendEntryPath: './b.cjs', extensionPoints: [{ kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: { $type: 'Badge' } } }] };
  const problems = (fn: () => unknown): string[] => {
    try {
      fn();
    } catch (err) {
      if (err instanceof ZodError) {
        return err.issues.map((i) => i.message);
      }
      throw err;
    }
    return [];
  };

  it('accepts it, in the packaged and in the source manifest', () => {
    expect(parseManifest({ ...base, optionalRequires: { task: '*' } }).optionalRequires).toEqual({ task: '*' });
    expect(parseSourceManifest({ id: 'm', extensionPoints: base.extensionPoints, optionalRequires: { task: '^1.0.0' } }).optionalRequires).toEqual({ task: '^1.0.0' });
  });

  it('refuses an id that is in both keys, naming what each means', () => {
    const found = problems(() => parseManifest({ ...base, requires: { task: '*' }, optionalRequires: { task: '*' } }));
    expect(found).toEqual([expect.stringContaining('"task" is in both "requires" and "optionalRequires"')]);
    expect(problems(() => parseSourceManifest({ id: 'm', extensionPoints: base.extensionPoints, requires: { task: '*' }, optionalRequires: { task: '*' } }))).toHaveLength(1);
  });

  it('refuses a module that lists itself', () => {
    expect(problems(() => parseManifest({ ...base, optionalRequires: { m: '*' } }))).toEqual([expect.stringContaining('cannot list itself')]);
  });

  it('refuses an invalid range when the module loads', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-optional-range-'));
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-optional-range-cfg-'));
    try {
      fs.writeFileSync(path.join(dir, 'backend.cjs'), 'module.exports = function () {};\n');
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ ...base, backendEntryPath: './backend.cjs', optionalRequires: { task: 'not a range' } }));
      const { server } = await buildServer({ configDir, publicDir: path.join(dir, 'none') });
      const res = await server.inject({ method: 'POST', url: '/api/modules/register', payload: { id: 'm', source: { type: 'file', path: path.join(dir, 'manifest.json') } } });
      await server.close();
      expect(res.statusCode).toBe(422);
      expect((res.json() as { error: string }).error).toContain('optionalRequires "task" has an invalid semver range');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(configDir, { recursive: true, force: true });
    }
  });
});
