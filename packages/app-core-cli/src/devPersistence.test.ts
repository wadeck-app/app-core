import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as url from 'node:url';
import { checkModule } from './check.js';
import { packageModule } from './package.js';
import { DEV_VERSION, parseDevArgs, runDev, type DevHandle, type DevOptions } from './dev.js';
import { BASE_MANIFEST, makeModule, removeModule } from './test-helpers/makeModule.js';

// Decision 98: `dev` keeps its config dir (<module-dir>/.app-core-dev) between runs, so ctx.dataDir and the
// persisted previous version survive; --reset wipes it, --previous-version exercises migrate.

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

async function start(moduleDir: string, opts: DevOptions = {}): Promise<DevHandle> {
  const handle = await runDev(moduleDir, { port: 0, ...opts });
  handles.push(handle);
  return handle;
}

// Closes a handle now (not at the end of the test), so a second run can follow.
async function stop(handle: DevHandle): Promise<void> {
  handles.splice(handles.indexOf(handle), 1);
  await handle.close();
}

// A module whose setup and migrate leave a line in its data folder, so a test can read what ran.
function persistentModule(): string {
  const dir = makeModule({
    'manifest.json': JSON.stringify({ ...BASE_MANIFEST, lifecycle: { migrate: './src/backend/migrate.ts' } }, null, 2),
    'src/backend/index.ts':
      "import * as fs from 'node:fs';\n" +
      "import * as path from 'node:path';\n" +
      "export default function (ctx: { dataDir: string }): void {\n" +
      "  fs.appendFileSync(path.join(ctx.dataDir, 'setups.log'), 'setup\\n');\n" +
      '}\n',
    'src/backend/migrate.ts':
      "import * as fs from 'node:fs';\n" +
      "import * as path from 'node:path';\n" +
      "export default function (ctx: { dataDir: string; previousVersion: string | null; version: string }): void {\n" +
      "  fs.appendFileSync(path.join(ctx.dataDir, 'migrate.log'), ctx.previousVersion + ' -> ' + ctx.version + '\\n');\n" +
      '}\n',
  });
  dirs.push(dir);
  return dir;
}

const read = (dir: string, ...parts: string[]): string => fs.readFileSync(path.join(dir, '.app-core-dev', ...parts), 'utf8');
const exists = (dir: string, ...parts: string[]): boolean => fs.existsSync(path.join(dir, '.app-core-dev', ...parts));

describe('dev keeps its data between runs', () => {
  it('uses <module-dir>/.app-core-dev and leaves it in place on close, with data/ and state/ in it', async () => {
    const dir = persistentModule();
    const handle = await start(dir);

    expect(handle.configDir).toBe(path.join(dir, '.app-core-dev'));
    await stop(handle);

    expect(fs.existsSync(handle.configDir)).toBe(true);
    expect(read(dir, 'data', 'tiny', 'setups.log')).toBe('setup\n');
    expect(JSON.parse(read(dir, 'state', 'tiny.json'))).toEqual({ version: DEV_VERSION });
  });

  it('a second run sees the first run\'s data: setup runs again on the same data folder', async () => {
    const dir = persistentModule();
    await stop(await start(dir));
    await stop(await start(dir));

    expect(read(dir, 'data', 'tiny', 'setups.log')).toBe('setup\nsetup\n');
  });

  it('an unchanged version is not an update: migrate does not run between two runs', async () => {
    const dir = persistentModule();
    await stop(await start(dir));
    await stop(await start(dir));

    expect(exists(dir, 'data', 'tiny', 'migrate.log')).toBe(false);
  });

  it('rewrites the registry each run: an entry left by an earlier run is not loaded again', async () => {
    const dir = persistentModule();
    await stop(await start(dir));
    const stale = path.join(dir, '.app-core-dev', 'modules', 'ghost.json');
    fs.writeFileSync(stale, JSON.stringify({ id: 'ghost', source: { type: 'file', path: path.join(dir, 'nowhere', 'manifest.json') } }));

    const handle = await start(dir);

    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.readdirSync(path.join(handle.configDir, 'modules'))).toEqual(['tiny.json']);
    const body = (await (await fetch(`${handle.url}/api/modules`)).json()) as { failed: unknown[] };
    expect(body.failed).toEqual([]);
  });

  it('keeps the state of the dependencies in the same folder', async () => {
    const contributor = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-cli-dev-persist-contrib-'));
    dirs.push(contributor);
    fs.cpSync(path.join(fixturesDir, 'app-module-slot-contributor-a'), contributor, {
      recursive: true,
      filter: (source) => !['dist-module', 'node_modules'].includes(path.basename(source)),
    });

    const handle = await start(contributor, { links: { [PROVIDER_PACKAGE]: path.join(fixturesDir, 'app-module-slot-provider') } });
    await stop(handle);

    expect(JSON.parse(read(contributor, 'state', 'slot-provider.json'))).toEqual({ version: '1.0.0' });
    expect(JSON.parse(read(contributor, 'state', 'slot-contributor-a.json'))).toEqual({ version: DEV_VERSION });
    expect(exists(contributor, 'data', 'slot-provider')).toBe(true);
  });
});

describe('--reset', () => {
  it('wipes the folder before starting: data and state of earlier runs are gone', async () => {
    const dir = persistentModule();
    await stop(await start(dir));
    fs.writeFileSync(path.join(dir, '.app-core-dev', 'data', 'tiny', 'precious.txt'), 'x');

    const handle = await start(dir, { reset: true });

    expect(exists(dir, 'data', 'tiny', 'precious.txt')).toBe(false);
    // Only this run's setup is in the log.
    expect(read(dir, 'data', 'tiny', 'setups.log')).toBe('setup\n');
    expect(handle.resetPerformed).toBe(true);
  });

  it('without --reset nothing is wiped', async () => {
    const dir = persistentModule();
    await stop(await start(dir));
    fs.writeFileSync(path.join(dir, '.app-core-dev', 'data', 'tiny', 'precious.txt'), 'x');

    const handle = await start(dir);

    expect(exists(dir, 'data', 'tiny', 'precious.txt')).toBe(true);
    expect(handle.resetPerformed).toBe(false);
  });

  it('works when there is nothing to wipe yet', async () => {
    const dir = persistentModule();
    const handle = await start(dir, { reset: true });
    expect(handle.resetPerformed).toBe(false);
  });
});

describe('--previous-version', () => {
  it('writes the state file so migrate runs with that previousVersion', async () => {
    const dir = persistentModule();
    const handle = await start(dir, { previousVersion: '0.9.0' });

    expect(read(dir, 'data', 'tiny', 'migrate.log')).toBe(`0.9.0 -> ${DEV_VERSION}\n`);
    // After a successful load the loaded version is persisted as usual.
    expect(JSON.parse(read(dir, 'state', 'tiny.json'))).toEqual({ version: DEV_VERSION });
    expect(handle.modules.at(-1)?.id).toBe('tiny');
  });

  it('migrate can be exercised again on the next run by passing it again, and not otherwise', async () => {
    const dir = persistentModule();
    await stop(await start(dir, { previousVersion: '0.9.0' }));
    await stop(await start(dir));
    expect(read(dir, 'data', 'tiny', 'migrate.log')).toBe(`0.9.0 -> ${DEV_VERSION}\n`);

    await stop(await start(dir, { previousVersion: '0.8.0' }));
    expect(read(dir, 'data', 'tiny', 'migrate.log')).toBe(`0.9.0 -> ${DEV_VERSION}\n0.8.0 -> ${DEV_VERSION}\n`);
  });

  it('refuses the version dev loads, since migrate would silently not run', async () => {
    const dir = persistentModule();
    await expect(runDev(dir, { port: 0, previousVersion: DEV_VERSION })).rejects.toThrow(
      new RegExp(`--previous-version ${DEV_VERSION.replace(/\./g, '\\.')} is the version dev loads.*migrate would not run.*another version`, 's'),
    );
    // Nothing was started or written.
    expect(exists(dir, 'state', 'tiny.json')).toBe(false);
  });

  it('combines with --reset: wipe first, then pretend an older version was running', async () => {
    const dir = persistentModule();
    await stop(await start(dir));
    await stop(await start(dir, { reset: true, previousVersion: '0.5.0' }));

    // The wiped setup log holds only the last run; migrate ran once.
    expect(read(dir, 'data', 'tiny', 'setups.log')).toBe('setup\n');
    expect(read(dir, 'data', 'tiny', 'migrate.log')).toBe(`0.5.0 -> ${DEV_VERSION}\n`);
  });
});

describe('parseDevArgs: --reset and --previous-version', () => {
  it('reads both flags', () => {
    expect(parseDevArgs(['--reset', '--previous-version', '1.2.3'])).toMatchObject({ reset: true, previousVersion: '1.2.3' });
    expect(parseDevArgs([])).toMatchObject({ reset: false });
    expect(parseDevArgs([]).previousVersion).toBeUndefined();
  });

  it('rejects --previous-version without a value', () => {
    expect(() => parseDevArgs(['--previous-version'])).toThrow(/--previous-version needs a version, e\.g\. --previous-version 1\.0\.0/);
    expect(() => parseDevArgs(['--previous-version', '--watch'])).toThrow(/needs a version/);
  });
});

describe('.app-core-dev next to the sources', () => {
  const leftovers = (dir: string): void => {
    fs.mkdirSync(path.join(dir, '.app-core-dev', 'data', 'tiny'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.app-core-dev', 'data', 'tiny', 'leftover.txt'), 'x');
    fs.mkdirSync(path.join(dir, '.app-core-dev', 'modules'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.app-core-dev', 'modules', 'tiny.json'), '{}');
  };

  it('check accepts the dot folder', async () => {
    const dir = persistentModule();
    leftovers(dir);
    expect((await checkModule(dir)).issues).toEqual([]);
  });

  it('package never copies it to the output', async () => {
    const dir = persistentModule();
    leftovers(dir);
    const outDir = path.join(dir, 'dist-module');
    await packageModule({ moduleDir: dir, outDir, version: '1.0.0' });

    const files = fs.readdirSync(outDir, { recursive: true }).map(String);
    expect(files.filter((f) => f.includes('.app-core-dev') || f.includes('leftover'))).toEqual([]);
  });

  it('is created by dev itself after a real run and still passes check', async () => {
    const dir = persistentModule();
    await stop(await start(dir));
    expect(exists(dir, 'state', 'tiny.json')).toBe(true);
    expect((await checkModule(dir)).issues).toEqual([]);
  });
});
