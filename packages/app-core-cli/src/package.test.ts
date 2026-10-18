import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getErrorMessage } from '@wadeck-app/app-core-server/errors';
import { packageModule, parsePackageArgs, resolveVersion, validatePackagedOutput } from './package.js';
import { validateManifestFile } from './validate.js';
import { BASE_MANIFEST, DSL_COMPONENT_FILES, makeModule, removeModule } from './test-helpers/makeModule.js';

const dirs: string[] = [];

function track(dir: string): string {
  dirs.push(dir);
  return dir;
}

function module_(overrides: Record<string, string | null> = {}): string {
  return track(makeModule(overrides));
}

function outDir(): string {
  return path.join(track(fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-cli-out-'))), 'dist-module');
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    removeModule(dir);
  }
});

function read(out: string, rel: string): string {
  const file = path.join(out, rel);
  if (!fs.existsSync(file)) {
    throw new Error(`expected output file ${file} to exist; output has: ${listAll(out).join(', ')}`);
  }
  return fs.readFileSync(file, 'utf8');
}

function listAll(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
    .sort();
}

describe('resolveVersion', () => {
  it('prefers --version over BUNDLE_VERSION', () => {
    expect(resolveVersion('1.2.3', { BUNDLE_VERSION: '9.9.9' })).toBe('1.2.3');
  });

  it('falls back to BUNDLE_VERSION', () => {
    expect(resolveVersion(undefined, { BUNDLE_VERSION: '2026.10.18-001' })).toBe('2026.10.18-001');
  });

  it('fails with an actionable error when neither is set, or when they are blank', () => {
    expect(() => resolveVersion(undefined, {})).toThrow(/--version.*BUNDLE_VERSION/s);
    expect(() => resolveVersion(undefined, { BUNDLE_VERSION: '  ' })).toThrow(/BUNDLE_VERSION/);
    expect(() => resolveVersion('', {})).toThrow(/--version/);
  });
});

describe('parsePackageArgs', () => {
  it('reads --out and --version', () => {
    expect(parsePackageArgs(['--out', 'build', '--version', '1.0.0'])).toEqual({ out: 'build', version: '1.0.0' });
    expect(parsePackageArgs([])).toEqual({ out: undefined, version: undefined });
  });

  it('rejects a missing value and an unknown flag', () => {
    expect(() => parsePackageArgs(['--out'])).toThrow(/--out needs a value/);
    expect(() => parsePackageArgs(['--version', '--out', 'x'])).toThrow(/--version needs a value/);
    expect(() => parsePackageArgs(['--outt', 'x'])).toThrow(/Unknown option "--outt"/);
  });
});

describe('packageModule: backend', () => {
  it('writes a CJS bundle with the footer, a sourcemap, no minification, tree-shaken', async () => {
    const dir = module_({
      'src/backend/index.ts':
        "import { GREETING } from '../commons/greeting.js';\n" +
        'function computeGreetingForTest(): string {\n  return GREETING;\n}\n' +
        "export default function (ctx: { registerRoute: (m: string, p: string, h: (r: unknown, reply: { send: (b: unknown) => void }) => void) => void }): void {\n" +
        "  ctx.registerRoute('GET', '/ping', (_req, reply) => reply.send({ greeting: computeGreetingForTest() }));\n" +
        '}\n',
      'src/commons/greeting.ts': "export const GREETING = 'hello';\nexport const NEVER_USED = 'zzz-unused-marker';\n",
    });
    const out = outDir();
    await packageModule({ moduleDir: dir, outDir: out, version: '1.2.3' });

    const backend = read(out, 'api-backend/backend.cjs');
    expect(backend).toContain('module.exports = module.exports.default;');
    expect(backend).toContain('computeGreetingForTest');
    expect(backend.split('\n').length).toBeGreaterThan(5);
    expect(backend).not.toContain('zzz-unused-marker');
    expect(backend).toContain('"hello"');
    expect(read(out, 'api-backend/backend.cjs.map')).toContain('"sources"');
  });

  it('turns a bundling failure into an error naming the file and the missing import', async () => {
    const dir = module_({ 'src/backend/index.ts': "import 'does-not-exist-pkg';\nexport default function () {}\n" });
    await expect(packageModule({ moduleDir: dir, outDir: outDir(), version: '1.0.0' })).rejects.toThrow(
      /src[\\/]backend[\\/]index\.ts.*does-not-exist-pkg|does-not-exist-pkg.*src[\\/]backend[\\/]index\.ts/s,
    );
  });
});

describe('packageModule: output manifest and views', () => {
  it('stamps the version and rewrites the backend and view paths; the result is a valid output manifest', async () => {
    const dir = module_();
    const out = outDir();
    const result = await packageModule({ moduleDir: dir, outDir: out, version: '2026.10.18-001' });

    expect(result.manifestPath).toBe(path.join(out, 'manifest.json'));
    const validated = validateManifestFile(path.join(out, 'manifest.json'));
    if (!validated.ok) {
      throw new Error(validated.message);
    }
    expect(validated.manifest).toMatchObject({
      id: 'tiny',
      version: '2026.10.18-001',
      backendEntryPath: './api-backend/backend.cjs',
    });
    expect(validated.manifest.extensionPoints[0]!.view).toEqual({ type: 'path', value: './dsl-frontend/home.json' });
    expect(validated.manifest.dslLib).toBeUndefined();
  });

  it('re-emits the view compact and parsed (YAML in, JSON out)', async () => {
    const out = outDir();
    await packageModule({ moduleDir: module_(), outDir: out, version: '1.0.0' });
    expect(read(out, 'dsl-frontend/home.json')).toBe(JSON.stringify({ $type: 'Badge', label: 'hi' }));
  });

  it('keeps inline views as they are and emits no dsl-frontend folder when no view is a file', async () => {
    const manifest = JSON.stringify({
      ...BASE_MANIFEST,
      extensionPoints: [{ kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: { $type: 'Badge', label: 'x' } } }],
    });
    const out = outDir();
    const result = await packageModule({ moduleDir: module_({ 'manifest.json': manifest, 'src/dsl-views/home.yaml': null }), outDir: out, version: '1.0.0' });
    expect(result.warnings).toEqual([]);
    expect(fs.existsSync(path.join(out, 'dsl-frontend'))).toBe(false);
  });

  it('emits only the referenced views and warns about the others, naming each file', async () => {
    const out = outDir();
    const result = await packageModule({
      moduleDir: module_({ 'src/dsl-views/orphan.yaml': '$type: Badge\n', 'src/dsl-views/sub/deep-orphan.json': '{}' }),
      outDir: out,
      version: '1.0.0',
    });
    expect(listAll(out).filter((f) => f.startsWith('dsl-frontend/'))).toEqual(['dsl-frontend/home.json']);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.join('\n')).toContain('src/dsl-views/orphan.yaml');
    expect(result.warnings.join('\n')).toContain('src/dsl-views/sub/deep-orphan.json');
    expect(result.warnings[0]).toMatch(/not referenced/);
  });

  it('keeps nested view folders and emits a view referenced twice once', async () => {
    const manifest = JSON.stringify({
      ...BASE_MANIFEST,
      extensionPoints: [
        { kind: 'page', slot: 'nav', label: 'A', view: { type: 'path', value: './src/dsl-views/sub/a.yaml' } },
        { kind: 'widget', slot: 'dashboard', view: { type: 'path', value: './src/dsl-views/sub/a.yaml' } },
      ],
    });
    const out = outDir();
    await packageModule({
      moduleDir: module_({ 'manifest.json': manifest, 'src/dsl-views/home.yaml': null, 'src/dsl-views/sub/a.yaml': '$type: Badge\n' }),
      outDir: out,
      version: '1.0.0',
    });
    const parsed = JSON.parse(read(out, 'manifest.json')) as { extensionPoints: Array<{ view: { value: string } }> };
    expect(parsed.extensionPoints.map((e) => e.view.value)).toEqual(['./dsl-frontend/sub/a.json', './dsl-frontend/sub/a.json']);
  });

  it('refuses two referenced views that would be emitted to the same file', async () => {
    const manifest = JSON.stringify({
      ...BASE_MANIFEST,
      extensionPoints: [
        { kind: 'page', slot: 'nav', label: 'A', view: { type: 'path', value: './src/dsl-views/a.yaml' } },
        { kind: 'widget', slot: 'dashboard', view: { type: 'path', value: './src/dsl-views/a.json' } },
      ],
    });
    const dir = module_({ 'manifest.json': manifest, 'src/dsl-views/home.yaml': null, 'src/dsl-views/a.yaml': '$type: Badge\n', 'src/dsl-views/a.json': '{"$type":"Badge"}' });
    await expect(packageModule({ moduleDir: dir, outDir: outDir(), version: '1.0.0' })).rejects.toThrow(/a\.yaml.*a\.json.*dsl-frontend\/a\.json/s);
  });
});

describe('packageModule: dsl-lib', () => {
  it('builds src/dsl-components into a minified, tree-shaken esm entry that reads the shared singletons from the shell', async () => {
    const out = outDir();
    const dir = module_(DSL_COMPONENT_FILES);
    await packageModule({ moduleDir: dir, outDir: out, version: '1.0.0' });

    const entry = read(out, 'dsl-lib/entries.mjs');
    expect(entry).toContain('__APP_CORE_SHARED__');
    expect(entry).toContain('react/jsx-runtime');
    expect(entry).toContain('@wadeck-app/dsl-ui');
    expect(entry).not.toContain('never referenced');
    expect(entry).toMatch(/export\s*\{/);
    expect(entry.trim().split('\n').length).toBeLessThanOrEqual(3);

    const manifest = JSON.parse(read(out, 'manifest.json')) as { dslLib: Record<string, unknown> };
    expect(manifest.dslLib).toEqual({ entry: './dsl-lib/entries.mjs', shared: { react: '^19' } });
  });

  it('copies src/dsl-components/style.css as built and declares it', async () => {
    const out = outDir();
    await packageModule({ moduleDir: module_({ ...DSL_COMPONENT_FILES, 'src/dsl-components/style.css': '.hello { color: red; }\n' }), outDir: out, version: '1.0.0' });
    expect(read(out, 'dsl-lib/style.css')).toBe('.hello { color: red; }\n');
    const manifest = JSON.parse(read(out, 'manifest.json')) as { dslLib: { css: string } };
    expect(manifest.dslLib.css).toBe('./dsl-lib/style.css');
  });

  it('emits no dsl-lib folder for a module without dslLib', async () => {
    const out = outDir();
    await packageModule({ moduleDir: module_(), outDir: out, version: '1.0.0' });
    expect(fs.existsSync(path.join(out, 'dsl-lib'))).toBe(false);
  });
});

describe('packageModule: safety', () => {
  it('runs check first and fails with every issue, writing nothing', async () => {
    const dir = module_({ '.gitignore': null, 'notes.txt': 'x' });
    const out = outDir();
    const error = await packageModule({ moduleDir: dir, outDir: out, version: '1.0.0' }).then(
      () => {
        throw new Error('expected packageModule to reject');
      },
      (err: Error) => err,
    );
    const message = getErrorMessage(error);
    expect(message).toContain('.gitignore');
    expect(message).toContain('notes.txt');
    expect(message).toContain('Fix:');
    expect(fs.existsSync(out)).toBe(false);
  });

  it('replaces a previous output instead of merging into it', async () => {
    const out = outDir();
    fs.mkdirSync(path.join(out, 'dsl-frontend'), { recursive: true });
    fs.writeFileSync(path.join(out, 'dsl-frontend', 'stale.json'), '{}');
    await packageModule({ moduleDir: module_(), outDir: out, version: '1.0.0' });
    expect(fs.existsSync(path.join(out, 'dsl-frontend', 'stale.json'))).toBe(false);
  });

  it('refuses an output folder that is the module, inside src, or an ancestor of the module', async () => {
    const dir = module_();
    for (const bad of [dir, path.join(dir, 'src'), path.join(dir, 'src', 'backend', 'nested'), path.dirname(dir)]) {
      await expect(packageModule({ moduleDir: dir, outDir: bad, version: '1.0.0' }), bad).rejects.toThrow(/output folder/);
    }
    expect(fs.existsSync(path.join(dir, 'src', 'backend', 'index.ts'))).toBe(true);
  });
});

describe('validatePackagedOutput', () => {
  function writeOut(manifest: unknown, files: string[] = []): string {
    const out = track(fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-cli-validate-out-')));
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest));
    for (const rel of files) {
      fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
      fs.writeFileSync(path.join(out, rel), 'x');
    }
    return out;
  }

  const base = {
    id: 'tiny',
    version: '1.0.0',
    backendEntryPath: './api-backend/backend.cjs',
    extensionPoints: [{ kind: 'page', slot: 'nav', view: { type: 'path', value: './dsl-frontend/home.json' } }],
  };

  it('accepts a complete output', () => {
    expect(() => validatePackagedOutput(writeOut(base, ['api-backend/backend.cjs', 'dsl-frontend/home.json']))).not.toThrow();
  });

  it('names a missing backend, view, dsl-lib entry or css', () => {
    const withLib = { ...base, dslLib: { entry: './dsl-lib/entries.mjs', css: './dsl-lib/style.css', shared: {} } };
    expect(() => validatePackagedOutput(writeOut(base, ['dsl-frontend/home.json']))).toThrow(/api-backend[\\/]backend\.cjs/);
    expect(() => validatePackagedOutput(writeOut(base, ['api-backend/backend.cjs']))).toThrow(/dsl-frontend[\\/]home\.json/);
    expect(() => validatePackagedOutput(writeOut(withLib, ['api-backend/backend.cjs', 'dsl-frontend/home.json', 'dsl-lib/style.css']))).toThrow(/entries\.mjs/);
    expect(() => validatePackagedOutput(writeOut(withLib, ['api-backend/backend.cjs', 'dsl-frontend/home.json', 'dsl-lib/entries.mjs']))).toThrow(/style\.css/);
  });

  it('refuses a path that resolves outside the output folder', () => {
    const outside = { ...base, backendEntryPath: '../escaped.cjs' };
    expect(() => validatePackagedOutput(writeOut(outside, ['api-backend/backend.cjs']))).toThrow(/escaped\.cjs.*outside/s);
  });

  it('reports an invalid manifest with the validation details', () => {
    expect(() => validatePackagedOutput(writeOut({ version: '1.0.0' }))).toThrow(/failed manifest validation/);
  });
});

describe('packageModule: lifecycle hooks', () => {
  const hookFile = 'export default async function (ctx: { dataDir: string }): Promise<void> {\n  void ctx.dataDir;\n}\n';
  const files = {
    'manifest.json': JSON.stringify({ ...BASE_MANIFEST, lifecycle: { teardown: './src/backend/teardown.ts', migrate: './src/backend/migrate.ts' } }),
    'src/backend/teardown.ts': hookFile,
    'src/backend/migrate.ts': hookFile,
  };

  it('bundles each hook like the backend (CJS, footer, sourcemap) and rewrites the manifest paths', async () => {
    const out = outDir();
    await packageModule({ moduleDir: module_(files), outDir: out, version: '1.0.0' });

    for (const hook of ['teardown', 'migrate']) {
      expect(read(out, `api-backend/${hook}.cjs`)).toContain('module.exports = module.exports.default;');
      expect(read(out, `api-backend/${hook}.cjs.map`)).toContain('"sources"');
    }
    const manifest = JSON.parse(read(out, 'manifest.json')) as { lifecycle: unknown };
    expect(manifest.lifecycle).toEqual({ teardown: './api-backend/teardown.cjs', migrate: './api-backend/migrate.cjs' });
  });

  it('emits no lifecycle block and no hook file for a module without hooks', async () => {
    const out = outDir();
    await packageModule({ moduleDir: module_(), outDir: out, version: '1.0.0' });
    expect(JSON.parse(read(out, 'manifest.json'))).not.toHaveProperty('lifecycle');
    expect(listAll(out).filter((f) => /teardown|migrate/.test(f))).toEqual([]);
  });

  it('fails in check, writing nothing, when a declared hook file is missing', async () => {
    const out = outDir();
    await expect(packageModule({ moduleDir: module_({ ...files, 'src/backend/migrate.ts': null }), outDir: out, version: '1.0.0' })).rejects.toThrow(/src\/backend\/migrate\.ts.*lifecycle\.migrate/s);
    expect(fs.existsSync(out)).toBe(false);
  });

  it('the output validation names a hook file missing from the output', () => {
    const outPath = track(fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-cli-hook-out-')));
    fs.mkdirSync(path.join(outPath, 'api-backend'));
    fs.writeFileSync(path.join(outPath, 'api-backend', 'backend.cjs'), 'x');
    fs.writeFileSync(
      path.join(outPath, 'manifest.json'),
      JSON.stringify({
        id: 'tiny',
        version: '1.0.0',
        backendEntryPath: './api-backend/backend.cjs',
        lifecycle: { teardown: './api-backend/teardown.cjs' },
        extensionPoints: [{ kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: { $type: 'Badge' } } }],
      }),
    );
    expect(() => validatePackagedOutput(outPath)).toThrow(/lifecycle\.teardown.*teardown\.cjs.*does not exist/s);
  });
});
