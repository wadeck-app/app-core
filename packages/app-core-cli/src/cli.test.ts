import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as url from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { validateManifestFile } from './validate.js';
import { parseDevArgs, runDev } from './dev.js';
import { BASE_MANIFEST, makeModule, removeModule } from './test-helpers/makeModule.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../../test-app-modules');
const cliEntry = path.join(__dirname, '../dist/cli.js');

// The packaged output (dist-module) of a fixture, built by scripts/build-fixtures.mjs before the tests.
function builtFixture(name: string): string {
  const dir = path.join(fixturesDir, name, 'dist-module');
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) {
    throw new Error(`${dir}/manifest.json is missing: the fixtures are not built. Run "npm run build" then "node scripts/build-fixtures.mjs" from the repository root (npm run test:cli does it for you).`);
  }
  return dir;
}

describe('validateManifestFile', () => {
  it('passes a real valid manifest fixture and returns the parsed manifest', () => {
    const result = validateManifestFile(path.join(builtFixture('app-module-minimal'), 'manifest.json'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.version).toBeTruthy();
      expect(result.manifest.extensionPoints.length).toBeGreaterThan(0);
    }
  });

  it('fails with a clear message when the file is missing', () => {
    const result = validateManifestFile(path.join(fixturesDir, 'does-not-exist', 'manifest.json'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('No manifest found');
    }
  });

  it('fails with zod issue details on an invalid manifest', () => {
    const result = validateManifestFile(path.join(__dirname, '../test-fixtures/invalid-manifest.json'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('failed manifest validation');
    }
  });
});

describe('cli validate --json (real subprocess, not a unit-level call)', () => {
  it('emits the parsed manifest as JSON on success', () => {
    const manifestPath = path.join(builtFixture('app-module-minimal'), 'manifest.json');
    const stdout = execFileSync('node', [cliEntry, 'validate', manifestPath, '--json'], { encoding: 'utf8' });
    const parsed = JSON.parse(stdout);
    expect(parsed.version).toBeTruthy();
    expect(Array.isArray(parsed.extensionPoints)).toBe(true);
  });

  it('emits a JSON error object (not plain text) on an invalid manifest', () => {
    const manifestPath = path.join(__dirname, '../test-fixtures/invalid-manifest.json');
    let stdout = '';
    try {
      stdout = execFileSync('node', [cliEntry, 'validate', manifestPath, '--json'], { encoding: 'utf8' });
    } catch (err) {
      stdout = (err as { stdout?: string }).stdout ?? '';
    }
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toContain('failed manifest validation');
  });
});

describe('runDev', () => {
  let close: (() => Promise<void>) | undefined;
  const configDirs: string[] = [];

  // The fixtures live in the repo: dev's config dir (normally next to the module) goes to a temp dir instead.
  function scratchConfig(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-cli-dev-cfg-'));
    configDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    if (close) {
      await close();
    }
    close = undefined;
    for (const dir of configDirs.splice(0)) {
      removeModule(dir);
    }
  });

  it('boots the real server against a local module fixture', async () => {
    const result = await runDev(builtFixture('app-module-minimal'), { port: 0, configDir: scratchConfig() });
    close = result.close;
    expect(result.port).toBeGreaterThan(0);
  });

  it('registers the module under the id its manifest declares', async () => {
    const result = await runDev(builtFixture('app-module-minimal'), { port: 0, configDir: scratchConfig() });
    close = result.close;
    expect(result.moduleId).toBe('module-a');
  });

  it('accepts the manifest.json path and an explicit id that matches the manifest', async () => {
    const result = await runDev(path.join(builtFixture('app-module-minimal'), 'manifest.json'), { port: 0, moduleId: 'module-a', configDir: scratchConfig() });
    close = result.close;
    expect(result.moduleId).toBe('module-a');
  });

  it('refuses an explicit id that differs from the manifest id, naming both', async () => {
    await expect(runDev(builtFixture('app-module-minimal'), { port: 0, moduleId: 'custom' })).rejects.toThrow(
      /"custom".*"module-a"/s,
    );
  });

  it('refuses a manifest without an id and says how to add it', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-cli-dev-noid-'));
    try {
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ version: '1.0.0' }));
      await expect(runDev(dir, { port: 0 })).rejects.toThrow(/no "id".*add/s);
    } finally {
      removeModule(dir);
    }
  });

  // Neither built (no backendEntryPath) nor a source module (no src/): without this check the module landed in "failed" with a raw zod error.
  it('tells the user to run package when the manifest is neither built nor a source module', async () => {
    const dir = makeModule();
    fs.rmSync(path.join(dir, 'src'), { recursive: true, force: true });
    try {
      await expect(runDev(dir, { port: 0 })).rejects.toThrow(/no src[/] folder.*app-core-cli package.*dist-module/s);
    } finally {
      removeModule(dir);
    }
  });

  it('keeps its config dir on close (data/ and state/ survive for the next run)', async () => {
    const result = await runDev(builtFixture('app-module-minimal'), { port: 0, configDir: scratchConfig() });
    expect(fs.existsSync(result.configDir)).toBe(true);
    await result.close();
    expect(fs.existsSync(path.join(result.configDir, 'state', 'module-a.json'))).toBe(true);
  });

  it('puts the config dir next to the module: <module-dir>/.app-core-dev, and for a built dist-module the folder that holds it', async () => {
    const source = makeModule();
    try {
      const sourceRun = await runDev(source, { port: 0 });
      expect(sourceRun.configDir).toBe(path.join(source, '.app-core-dev'));
      await sourceRun.close();

      // A copy of a built fixture named dist-module: its config dir sits beside it, never inside the output.
      const holder = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-cli-dev-built-'));
      configDirs.push(holder);
      fs.cpSync(builtFixture('app-module-minimal'), path.join(holder, 'dist-module'), { recursive: true });
      const builtRun = await runDev(path.join(holder, 'dist-module'), { port: 0 });
      expect(builtRun.configDir).toBe(path.join(holder, '.app-core-dev'));
      await builtRun.close();
      expect(fs.existsSync(path.join(holder, 'dist-module', '.app-core-dev'))).toBe(false);
    } finally {
      removeModule(source);
    }
  });

  it('refuses --watch on built output and says to pass the module folder', async () => {
    await expect(
      runDev(builtFixture('app-module-minimal'), { port: 0, watch: true, onRebuild: () => undefined, onWatchError: () => undefined }),
    ).rejects.toThrow(/--watch needs a source module/);
  });

  it('explains what to pass when no manifest.json is found', async () => {
    await expect(runDev(path.join(fixturesDir, 'does-not-exist'), { port: 0 })).rejects.toThrow(/Pass the module folder/);
  });
});

describe('parseDevArgs', () => {
  it('reads --id, --port, --watch, --poll and repeated --link', () => {
    const parsed = parseDevArgs(['--id', 'orchestrator', '--port', '0', '--watch', '--poll', '--link', '@a/p=./p', '--link', '@a/q=./q']);
    expect(parsed.moduleId).toBe('orchestrator');
    expect(parsed.port).toBe(0);
    expect(parsed.watch).toBe(true);
    expect(parsed.poll).toBe(true);
    expect(Object.keys(parsed.links)).toEqual(['@a/p', '@a/q']);
    expect(parseDevArgs([])).toEqual({ watch: false, poll: false, reset: false, links: {} });
  });

  it('rejects a missing value, a bad port, an unknown option and --poll without --watch', () => {
    expect(() => parseDevArgs(['--id'])).toThrow(/needs a value/);
    expect(() => parseDevArgs(['--id', '--other'])).toThrow(/needs a value/);
    expect(() => parseDevArgs(['--port', 'abc'])).toThrow(/--port needs a port number/);
    expect(() => parseDevArgs(['--port'])).toThrow(/--port needs a port number/);
    expect(() => parseDevArgs(['--link', 'nope'])).toThrow(/--link/);
    expect(() => parseDevArgs(['--wat'])).toThrow(/Unknown option "--wat".*Usage: app-core-cli dev/);
    expect(() => parseDevArgs(['--poll'])).toThrow(/--poll only applies to --watch/);
  });
});

interface CliRun {
  status: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], env: Record<string, string | undefined> = {}): CliRun {
  const fullEnv: Record<string, string | undefined> = { ...process.env, BUNDLE_VERSION: undefined, ...env };
  const result = spawnSync('node', [cliEntry, ...args], { encoding: 'utf8', env: fullEnv });
  if (result.status === null) {
    throw new Error(`cli ${args.join(' ')} did not exit normally: ${result.error?.message ?? 'killed by a signal'}`);
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('cli check / package (real subprocess)', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      removeModule(dir);
    }
  });

  function newModule(overrides: Record<string, string | null> = {}): string {
    const dir = makeModule(overrides);
    dirs.push(dir);
    return dir;
  }

  function scratchOut(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-cli-subproc-out-'));
    dirs.push(dir);
    return path.join(dir, 'dist-module');
  }

  it('check prints OK and exits 0 on a valid module', () => {
    const run = runCli(['check', newModule()]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('OK');
  });

  it('check lists every problem with its file and fix on stderr and exits 1', () => {
    const run = runCli(['check', newModule({ '.gitignore': null, 'notes.txt': 'x' })]);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('.gitignore');
    expect(run.stderr).toContain('notes.txt');
    expect(run.stderr).toContain('Fix:');
  });

  it('check without a folder prints usage and exits 1', () => {
    const run = runCli(['check']);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Usage: app-core-cli check <module-dir>');
  });

  it('package writes the output with --version and exits 0', () => {
    const out = scratchOut();
    const run = runCli(['package', newModule(), '--out', out, '--version', '3.4.5']);
    expect(run.status, run.stderr).toBe(0);
    const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')) as { version: string };
    expect(manifest.version).toBe('3.4.5');
  });

  it('package takes the version from BUNDLE_VERSION', () => {
    const out = scratchOut();
    const run = runCli(['package', newModule(), '--out', out], { BUNDLE_VERSION: '2026.10.18-007' });
    expect(run.status, run.stderr).toBe(0);
    const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')) as { version: string };
    expect(manifest.version).toBe('2026.10.18-007');
  });

  it('package without any version fails naming both ways to give one, and writes nothing', () => {
    const out = scratchOut();
    const run = runCli(['package', newModule(), '--out', out]);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('--version');
    expect(run.stderr).toContain('BUNDLE_VERSION');
    expect(fs.existsSync(out)).toBe(false);
  });

  it('package on an invalid module prints the check problems and exits 1', () => {
    const run = runCli(['package', newModule({ '.gitignore': null }), '--version', '1.0.0', '--out', scratchOut()]);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('.gitignore');
  });

  it('package prints warnings about unreferenced views on stderr and still succeeds', () => {
    const orphan = '$type: Badge\n';
    const run = runCli(['package', newModule({ 'src/dsl-views/orphan.yaml': orphan }), '--version', '1.0.0', '--out', scratchOut()]);
    expect(run.status, run.stderr).toBe(0);
    expect(run.stderr).toContain('src/dsl-views/orphan.yaml');
  });

  it('package without a folder prints usage and exits 1', () => {
    const run = runCli(['package']);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Usage: app-core-cli package <module-dir>');
  });

  it('dev without a folder prints the usage with its flags and exits 1', () => {
    const run = runCli(['dev']);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Usage: app-core-cli dev <module-dir>');
    expect(run.stderr).toContain('--watch');
    expect(run.stderr).toContain('--link <package>=<folder>');
  });

  it('dev with an unknown option fails before starting anything, naming the option and the usage', () => {
    const run = runCli(['dev', builtFixture('app-module-minimal'), '--wat']);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('app-core-cli dev failed: Unknown option "--wat"');
    expect(run.stderr).toContain('Usage: app-core-cli dev');
  });

  it('dev with --watch on built output fails with the fix', () => {
    const run = runCli(['dev', builtFixture('app-module-minimal'), '--watch', '--port', '0']);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('--watch needs a source module');
  });

  it('dev on a source module whose required module cannot be found names the id and the fixes', () => {
    const dir = newModule({
      'manifest.json': JSON.stringify({ ...BASE_MANIFEST, requires: { ghost: '^1.0.0' } }),
    });
    const run = runCli(['dev', dir, '--port', '0']);
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/ghost/);
    expect(run.stderr).toContain('Fix:');
  });

  it('the usage line lists init, check and package', () => {
    const run = runCli(['nope']);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('validate|init|check|package|dev|serve');
  });
});
