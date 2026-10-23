import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as url from 'node:url';
import { runDev, type DevHandle, type DevOptions, type RebuildResult } from './dev.js';
import { makeModule, removeModule } from './test-helpers/makeModule.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../../test-app-modules');
const PROVIDER_PACKAGE = '@wadeck-app/app-module-slot-provider';

const handles: DevHandle[] = [];
const dirs: string[] = [];

afterEach(async () => {
  for (const handle of handles.splice(0)) {
    await handle.close();
  }
  for (const dir of dirs.splice(0)) {
    removeModule(dir);
  }
});

async function start(moduleDir: string, opts: DevOptions): Promise<DevHandle> {
  const handle = await runDev(moduleDir, { port: 0, ...opts });
  handles.push(handle);
  return handle;
}

// Polls `probe` until it returns a value `accept` approves; fails with `what` and the last value on timeout.
async function waitFor<T>(what: string, probe: () => Promise<T> | T, accept: (value: T) => boolean, timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T | undefined;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      last = await probe();
      if (accept(last)) {
        return last;
      }
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out after ${timeoutMs} ms waiting for ${what}. Last value: ${JSON.stringify(last)}${lastError === undefined ? '' : `, last error: ${String(lastError)}`}`);
}

async function getJson(handle: DevHandle, route: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${handle.url}${route}`);
  return { status: response.status, body: await response.json() };
}

// Copies a fixture's sources (not its build output) so dev never rewrites the shared dist-module the other tests use.
function copyFixtureSources(name: string): string {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), `app-core-cli-dev-${name}-`));
  dirs.push(dest);
  fs.cpSync(path.join(fixturesDir, name), dest, {
    recursive: true,
    filter: (source) => !['dist-module', 'node_modules'].includes(path.basename(source)),
  });
  return dest;
}

describe('dev with dependencies (real server)', () => {
  it('registers the required provider and fills its slot from a source contributor', async () => {
    const contributor = copyFixtureSources('app-module-slot-contributor-a');
    const handle = await start(contributor, { links: { [PROVIDER_PACKAGE]: path.join(fixturesDir, 'app-module-slot-provider') } });

    expect(handle.modules.map((m) => [m.id, m.version, m.role])).toEqual([
      ['slot-provider', '1.0.0', 'dependency'],
      ['slot-contributor-a', '0.0.0-dev', 'under development'],
    ]);
    const modules = (await getJson(handle, '/api/modules')).body as { modules: Array<{ id: string }>; failed: unknown[] };
    expect(modules.modules.map((m) => m.id).sort()).toEqual(['slot-contributor-a', 'slot-provider']);
    expect(modules.failed).toEqual([]);

    const slot = await getJson(handle, '/api/slots/slot-provider:shared-slot');
    expect(slot.status).toBe(200);
    expect(JSON.stringify(slot.body)).toContain('contributor-a');
  });

  it('fails with the check messages, before starting a server, when the source module does not pass check', async () => {
    const contributor = copyFixtureSources('app-module-slot-contributor-a');
    // The provider is not reachable (no link): check reports it, dev starts nothing.
    await expect(runDev(contributor, { port: 0 })).rejects.toThrow(/Module check failed.*slot-provider/s);
  });
});

describe('dev --watch (real server)', () => {
  interface Watched {
    dir: string;
    handle: DevHandle;
    results: RebuildResult[];
    errors: string[];
  }

  async function watch(poll: boolean): Promise<Watched> {
    const dir = makeModule();
    dirs.push(dir);
    const results: RebuildResult[] = [];
    const errors: string[] = [];
    const handle = await start(dir, { watch: true, poll, onRebuild: (r) => results.push(r), onWatchError: (m) => errors.push(m) });
    return { dir, handle, results, errors };
  }

  const greetingFile = (dir: string): string => path.join(dir, 'src', 'commons', 'greeting.ts');
  const greeting = async (handle: DevHandle): Promise<unknown> => (await getJson(handle, '/api/modules/tiny/ping')).body;

  for (const poll of [false, true]) {
    it(`rebuilds and hot-updates on change, keeps the old version on a broken source, recovers on a fix (${poll ? 'polling' : 'fs.watch'})`, async () => {
      const { dir, handle, results, errors } = await watch(poll);
      expect(handle.watch?.mode).toBe(poll ? 'polling' : 'fs.watch');
      expect(await greeting(handle)).toEqual({ greeting: 'hello' });

      fs.writeFileSync(greetingFile(dir), "export const GREETING: string = 'changed';\n");
      await waitFor('the changed answer to be served', () => greeting(handle), (v) => JSON.stringify(v) === JSON.stringify({ greeting: 'changed' }));
      expect(results.at(-1)).toMatchObject({ ok: true, version: '0.0.0-dev' });

      const before = results.length;
      fs.writeFileSync(greetingFile(dir), "export const GREETING: string = ;\n");
      await waitFor('the failed rebuild to be reported', () => results.length, (n) => n > before);
      const failure = results.at(-1);
      expect(failure?.ok).toBe(false);
      expect(failure && !failure.ok ? failure.error : '').toContain('greeting.ts');
      expect(await greeting(handle)).toEqual({ greeting: 'changed' });

      fs.writeFileSync(greetingFile(dir), "export const GREETING: string = 'recovered';\n");
      await waitFor('the recovered answer to be served', () => greeting(handle), (v) => JSON.stringify(v) === JSON.stringify({ greeting: 'recovered' }));
      expect(results.at(-1)?.ok).toBe(true);
      expect(errors).toEqual([]);
    }, 120_000);
  }

  it('collapses a burst of changes into at most one rebuild per burst and serves the last one', async () => {
    const { dir, handle, results } = await watch(false);
    for (let i = 1; i <= 5; i += 1) {
      fs.writeFileSync(greetingFile(dir), `export const GREETING: string = 'burst-${i}';\n`);
    }
    await waitFor('the last burst answer to be served', () => greeting(handle), (v) => JSON.stringify(v) === JSON.stringify({ greeting: 'burst-5' }));
    expect(results.every((r) => r.ok)).toBe(true);
    // Debounced and serialised: far fewer rebuilds than writes (a slow disk may split the burst once).
    expect(results.length).toBeLessThanOrEqual(2);
  }, 120_000);

  it('picks up a manifest.json change', async () => {
    const { dir, handle, results } = await watch(false);
    const manifestFile = path.join(dir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as { extensionPoints: Array<{ label: string }> };
    manifest.extensionPoints[0]!.label = 'Renamed';
    fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    await waitFor(
      'the renamed extension point to be served',
      async () => JSON.stringify((await getJson(handle, '/api/modules')).body),
      (body) => body.includes('Renamed'),
    );
    expect(results.at(-1)?.ok).toBe(true);
  }, 120_000);

  it('close() stops rebuilding and keeps the config dir inside the module folder', async () => {
    const { dir, handle } = await watch(false);
    expect(handle.configDir).toBe(path.join(dir, '.app-core-dev'));
    await handle.close();
    expect(fs.existsSync(handle.configDir)).toBe(true);
  });

  it('writes nothing into the OS temp dir by itself: the only folders it leaves are the module copies the test removes', async () => {
    // Other processes on the machine (another test run, another `dev`) also write app-core-cli-dev-* folders into the shared
    // temp dir, so the temp dir is private to this test: whatever shows up in it was written by the code under test.
    const privateTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-cli-tmpcheck-'));
    dirs.push(privateTemp);
    const saved = { TMPDIR: process.env['TMPDIR'], TEMP: process.env['TEMP'], TMP: process.env['TMP'] };
    process.env['TMPDIR'] = process.env['TEMP'] = process.env['TMP'] = privateTemp;
    try {
      expect(os.tmpdir()).toBe(privateTemp);
      const { handle } = await watch(false);
      await handle.close();
      // Only the module copy of this test (named app-core-cli-module-*) is new; no app-core-cli-dev-* scratch dir.
      expect(fs.readdirSync(privateTemp).filter((name) => name.startsWith('app-core-cli-dev-'))).toEqual([]);
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  it('refuses watch without callbacks instead of dropping rebuild results', async () => {
    const dir = makeModule();
    dirs.push(dir);
    await expect(runDev(dir, { port: 0, watch: true })).rejects.toThrow(/onRebuild and onWatchError/);
  });
});
