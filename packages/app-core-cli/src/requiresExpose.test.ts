import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildServer } from '@wadeck-app/app-core-server/server';
import { checkModule, type CheckIssue } from './check.js';
import { packageModule, parsePackageArgs } from './package.js';
import { parseLinkArgs } from './providers.js';
import { BASE_MANIFEST, makeModule, removeModule } from './test-helpers/makeModule.js';

const dirs: string[] = [];

function track(dir: string): string {
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    removeModule(dir);
  }
});

const PROVIDER_MANIFEST = {
  id: 'prov',
  extensionPoints: [{ kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: { $type: 'Badge', label: 'p' } } }],
  expose: { types: './src/commons/types.ts', slots: { 'shared-slot': { accepts: ['Badge'] } } },
};

const TYPES_SOURCE = 'export interface Item {\n  id: string;\n}\nexport type ItemId = Item["id"];\n';

function providerFiles(overrides: Record<string, string | null> = {}): Record<string, string | null> {
  return {
    'manifest.json': JSON.stringify(PROVIDER_MANIFEST, null, 2),
    'package.json': JSON.stringify({ name: '@x/prov', files: ['dist-module'], exports: { './types': { types: './dist-module/types/index.d.ts' } } }),
    'src/commons/types.ts': TYPES_SOURCE,
    'src/dsl-views/home.yaml': null,
    ...overrides,
  };
}

function contributorManifest(view: Record<string, unknown> = { $type: 'Badge', label: 'c' }, extra: Record<string, unknown> = {}): string {
  return JSON.stringify(
    {
      id: 'contrib',
      requires: { prov: '^1.0.0' },
      extensionPoints: [{ kind: 'widget', slot: 'prov:shared-slot', view: { type: 'inline', value: view } }],
      ...extra,
    },
    null,
    2,
  );
}

function contributorFiles(overrides: Record<string, string | null> = {}): Record<string, string | null> {
  return {
    'manifest.json': contributorManifest(),
    'package.json': JSON.stringify({ name: '@x/contrib', files: ['dist-module'], dependencies: { '@x/prov': '^1.0.0' } }),
    'src/dsl-views/home.yaml': null,
    ...overrides,
  };
}

async function packagedProvider(version = '1.2.0'): Promise<string> {
  const dir = track(makeModule(providerFiles()));
  await packageModule({ moduleDir: dir, outDir: path.join(dir, 'dist-module'), version });
  return dir;
}

function only(issues: CheckIssue[], file: string): CheckIssue {
  const found = issues.filter((i) => i.file === file);
  if (found.length !== 1) {
    throw new Error(`expected exactly one issue for ${file}, got ${JSON.stringify(issues, null, 2)}`);
  }
  return found[0]!;
}

describe('--link', () => {
  it('parses name=folder pairs, repeated', () => {
    expect(parseLinkArgs(['--link', '@x/a=./a', '--link', 'b=/abs/b'])).toEqual({ '@x/a': path.resolve('./a'), b: path.resolve('/abs/b') });
    expect(parseLinkArgs([])).toEqual({});
  });

  it('rejects a malformed or unknown option with the usage', () => {
    expect(() => parseLinkArgs(['--link'])).toThrow(/--link needs a value/);
    expect(() => parseLinkArgs(['--link', 'noequals'])).toThrow(/<package>=<folder>/);
    expect(() => parseLinkArgs(['--lnk', 'a=b'])).toThrow(/Unknown option "--lnk"/);
  });

  it('is accepted by package alongside --out and --version', () => {
    expect(parsePackageArgs(['--out', 'o', '--link', 'a=b', '--version', '1.0.0'])).toMatchObject({ out: 'o', version: '1.0.0', links: { a: path.resolve('b') } });
  });
});

describe('check: expose.types', () => {
  it('passes with a types-only file and the package.json types export', async () => {
    const result = await checkModule(track(makeModule(providerFiles())));
    expect(result.issues).toEqual([]);
  });

  it('accepts a .d.ts file', async () => {
    const manifest = JSON.stringify({ ...PROVIDER_MANIFEST, expose: { ...PROVIDER_MANIFEST.expose, types: './src/commons/types.d.ts' } });
    const dir = track(makeModule(providerFiles({ 'manifest.json': manifest, 'src/commons/types.ts': null, 'src/commons/types.d.ts': 'export interface A {\n  a: 1;\n}\n' })));
    expect((await checkModule(dir)).issues).toEqual([]);
  });

  it('reports a missing types file', async () => {
    const issues = (await checkModule(track(makeModule(providerFiles({ 'src/commons/types.ts': null }))))).issues;
    const issue = only(issues, 'src/commons/types.ts');
    expect(issue.problem).toMatch(/expose\.types.*does not exist/);
    expect(issue.fix).toContain('src/commons/types.ts');
  });

  it('requires the types file to live in src/commons', async () => {
    const manifest = JSON.stringify({ ...PROVIDER_MANIFEST, expose: { ...PROVIDER_MANIFEST.expose, types: './src/backend/types.ts' } });
    const issues = (await checkModule(track(makeModule(providerFiles({ 'manifest.json': manifest, 'src/backend/types.ts': TYPES_SOURCE }))))).issues;
    expect(only(issues, 'manifest.json').problem).toMatch(/src\/commons/);
  });

  it('rejects runtime code in the types file, naming the file and the fix', async () => {
    const issues = (await checkModule(track(makeModule(providerFiles({ 'src/commons/types.ts': 'export const ID = 1;\nexport interface A { a: 1 }\n' }))))).issues;
    const issue = only(issues, 'src/commons/types.ts');
    expect(issue.problem).toMatch(/runtime code/);
    expect(issue.fix).toMatch(/interface|type/);
    expect(issue.fix).toContain('src/backend');
  });

  it('rejects a value import and an enum, which produce runtime code', async () => {
    for (const source of ["import { GREETING } from './greeting.js';\nexport type G = typeof GREETING;\n", 'export enum Color {\n  Red,\n}\n']) {
      const issues = (await checkModule(track(makeModule(providerFiles({ 'src/commons/types.ts': source, 'src/commons/greeting.ts': "export const GREETING = 'x';\n" }))))).issues;
      expect(issues.some((i) => i.file === 'src/commons/types.ts' && /runtime code/.test(i.problem)), source).toBe(true);
    }
  });

  it('rejects a relative import, since the types file is copied alone', async () => {
    const issues = (await checkModule(track(makeModule(providerFiles({ 'src/commons/types.ts': "import type { A } from './other.js';\nexport type B = A;\n", 'src/commons/other.ts': 'export interface A {\n  a: 1;\n}\n' }))))).issues;
    const issue = only(issues, 'src/commons/types.ts');
    expect(issue.problem).toMatch(/relative import/);
    expect(issue.fix).toMatch(/one file/);
  });

  it('requires the package.json types export', async () => {
    const noExport = JSON.stringify({ name: '@x/prov', files: ['dist-module'] });
    const issue = only((await checkModule(track(makeModule(providerFiles({ 'package.json': noExport }))))).issues, 'package.json');
    expect(issue.problem).toContain('exports["./types"]');
    expect(issue.fix).toContain('"./dist-module/types/index.d.ts"');
  });

  it('requires a package.json at all', async () => {
    const issue = only((await checkModule(track(makeModule(providerFiles({ 'package.json': null }))))).issues, 'package.json');
    expect(issue.problem).toMatch(/missing/);
  });
});

describe('check: requires and contributions', () => {
  it('passes when the provider is resolved from node_modules', async () => {
    const provider = await packagedProvider();
    const dir = track(makeModule(contributorFiles()));
    fs.mkdirSync(path.join(dir, 'node_modules', '@x'), { recursive: true });
    fs.cpSync(provider, path.join(dir, 'node_modules', '@x', 'prov'), { recursive: true });
    expect((await checkModule(dir)).issues).toEqual([]);
  });

  it('passes when the provider is resolved through --link', async () => {
    const provider = await packagedProvider();
    const dir = track(makeModule(contributorFiles()));
    expect((await checkModule(dir, { links: { '@x/prov': provider } })).issues).toEqual([]);
  });

  it('resolves the provider by manifest id, not by package name', async () => {
    const provider = await packagedProvider();
    const dir = track(makeModule(contributorFiles({ 'package.json': JSON.stringify({ name: '@x/c', files: ['dist-module'], devDependencies: { 'totally-different-name': '*' } }) })));
    expect((await checkModule(dir, { links: { 'totally-different-name': provider } })).issues).toEqual([]);
  });

  it('reports a provider that is in no dependency, listing what was looked at and the fix', async () => {
    const dir = track(makeModule(contributorFiles()));
    const issue = only((await checkModule(dir)).issues, 'manifest.json');
    expect(issue.problem).toContain('extensionPoints[0]');
    expect(issue.problem).toContain('"prov:shared-slot"');
    expect(issue.problem).toContain('@x/prov');
    expect(issue.problem).toMatch(/not installed/);
    expect(issue.fix).toMatch(/dist-module\/manifest\.json/);
    expect(issue.fix).toContain('--link');
  });

  it('says so when the dependency is installed but not built', async () => {
    const provider = track(makeModule(providerFiles()));
    const dir = track(makeModule(contributorFiles()));
    const issue = only((await checkModule(dir, { links: { '@x/prov': provider } })).issues, 'manifest.json');
    expect(issue.problem).toMatch(/no dist-module\/manifest\.json/);
  });

  it('reports a module without package.json that contributes to another module', async () => {
    const dir = track(makeModule(contributorFiles({ 'package.json': null })));
    const issues = (await checkModule(dir)).issues;
    expect(issues.some((i) => i.file === 'manifest.json' && /package\.json/.test(i.problem))).toBe(true);
  });

  it('requires "requires" to list the provider', async () => {
    const provider = await packagedProvider();
    const dir = track(makeModule(contributorFiles({ 'manifest.json': contributorManifest(undefined, { requires: undefined }) })));
    const issue = only((await checkModule(dir, { links: { '@x/prov': provider } })).issues, 'manifest.json');
    expect(issue.problem).toContain('"requires" does not list "prov"');
    expect(issue.fix).toContain('"requires"');
  });

  it('reports a slot the provider does not expose', async () => {
    const provider = await packagedProvider();
    const manifest = JSON.stringify({
      id: 'contrib',
      requires: { prov: '^1.0.0' },
      extensionPoints: [{ kind: 'widget', slot: 'prov:nope', view: { type: 'inline', value: { $type: 'Badge' } } }],
    });
    const issue = only((await checkModule(track(makeModule(contributorFiles({ 'manifest.json': manifest }))), { links: { '@x/prov': provider } })).issues, 'manifest.json');
    expect(issue.problem).toContain('does not expose the slot "nope"');
    expect(issue.fix).toContain('prov:shared-slot');
  });

  it('rejects a root $type the slot does not accept, on the view file when the view is a file', async () => {
    const provider = await packagedProvider();
    const manifest = JSON.stringify({
      id: 'contrib',
      requires: { prov: '^1.0.0' },
      extensionPoints: [{ kind: 'widget', slot: 'prov:shared-slot', view: { type: 'path', value: './src/dsl-views/form.yaml' } }],
    });
    const dir = track(makeModule(contributorFiles({ 'manifest.json': manifest, 'src/dsl-views/form.yaml': '$type: Form\nchildren:\n  - $type: Badge\n' })));
    const issue = only((await checkModule(dir, { links: { '@x/prov': provider } })).issues, 'src/dsl-views/form.yaml');
    expect(issue.problem).toContain('"Form"');
    expect(issue.problem).toContain('accepts only: Badge');
    expect(issue.fix).toContain('Badge');
  });

  it('rejects an inline root $type the slot does not accept, on manifest.json', async () => {
    const provider = await packagedProvider();
    const dir = track(makeModule(contributorFiles({ 'manifest.json': contributorManifest({ $type: 'Form' }) })));
    const issue = only((await checkModule(dir, { links: { '@x/prov': provider } })).issues, 'manifest.json');
    expect(issue.problem).toContain('"Form"');
  });

  it('does not validate the children of the contributed view', async () => {
    const provider = await packagedProvider();
    const dir = track(makeModule(contributorFiles({ 'manifest.json': contributorManifest({ $type: 'Badge', children: [{ $type: 'Form' }] }) })));
    expect((await checkModule(dir, { links: { '@x/prov': provider } })).issues).toEqual([]);
  });

  it('reports an unprefixed custom slot through the manifest validation', async () => {
    const manifest = JSON.stringify({ ...BASE_MANIFEST, extensionPoints: [{ kind: 'widget', slot: 'shared-slot', view: { type: 'inline', value: { $type: 'Badge' } } }] });
    const issue = only((await checkModule(track(makeModule({ 'manifest.json': manifest, 'src/dsl-views/home.yaml': null })))).issues, 'manifest.json');
    expect(issue.problem).toMatch(/shared-slot.*<providerId>:<slot>/s);
  });

  it('validates a contribution to the module own exposed slot without requires', async () => {
    const manifest = JSON.stringify({
      ...PROVIDER_MANIFEST,
      extensionPoints: [{ kind: 'widget', slot: 'prov:shared-slot', view: { type: 'inline', value: { $type: 'Form' } } }],
    });
    const issue = only((await checkModule(track(makeModule(providerFiles({ 'manifest.json': manifest })))) ).issues, 'manifest.json');
    expect(issue.problem).toContain('"Form"');
  });

  it('reports an invalid requires range', async () => {
    const dir = track(makeModule(contributorFiles({ 'manifest.json': contributorManifest(undefined, { requires: { prov: 'not a range' } }) })));
    const issues = (await checkModule(dir)).issues;
    expect(issues.some((i) => /invalid semver range/.test(i.problem))).toBe(true);
  });
});

describe('package: requires and expose', () => {
  it('copies the types as dist-module/types/index.d.ts and rewrites expose.types; requires and slots are kept', async () => {
    const provider = track(makeModule(providerFiles()));
    const out = path.join(provider, 'dist-module');
    await packageModule({ moduleDir: provider, outDir: out, version: '1.0.0' });
    expect(fs.readFileSync(path.join(out, 'types', 'index.d.ts'), 'utf8')).toBe(TYPES_SOURCE);
    const written = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')) as { expose: unknown; requires?: unknown };
    expect(written.expose).toEqual({ types: './types/index.d.ts', slots: { 'shared-slot': { accepts: ['Badge'] } } });

    const contributor = track(makeModule(contributorFiles()));
    const contribOut = path.join(contributor, 'dist-module');
    await packageModule({ moduleDir: contributor, outDir: contribOut, version: '1.0.0', links: { '@x/prov': provider } });
    expect((JSON.parse(fs.readFileSync(path.join(contribOut, 'manifest.json'), 'utf8')) as { requires: unknown }).requires).toEqual({ prov: '^1.0.0' });
  });

  it('refuses a types file with runtime code, writing nothing', async () => {
    const provider = track(makeModule(providerFiles({ 'src/commons/types.ts': 'export const X = 1;\n' })));
    const out = path.join(provider, 'dist-module');
    await expect(packageModule({ moduleDir: provider, outDir: out, version: '1.0.0' })).rejects.toThrow(/src\/commons\/types\.ts: .*runtime code[\s\S]*Fix:/);
    expect(fs.existsSync(out)).toBe(false);
  });

  it('refuses a contribution with a forbidden root $type, naming the view and the fix', async () => {
    const provider = await packagedProvider();
    const contributor = track(makeModule(contributorFiles({ 'manifest.json': contributorManifest({ $type: 'Form' }) })));
    await expect(
      packageModule({ moduleDir: contributor, outDir: path.join(contributor, 'dist-module'), version: '1.0.0', links: { '@x/prov': provider } }),
    ).rejects.toThrow(/"Form".*accepts only: Badge[\s\S]*Fix:/);
  });
});

describe('real server: provider and contributor packaged by the CLI', () => {
  async function setup(): Promise<{ server: Awaited<ReturnType<typeof buildServer>>['server']; providerManifest: string; contribManifest: string; contributorDir: string }> {
    const provider = await packagedProvider('1.2.0');
    const contributorDir = track(makeModule(contributorFiles()));
    await packageModule({ moduleDir: contributorDir, outDir: path.join(contributorDir, 'dist-module'), version: '1.0.0', links: { '@x/prov': provider } });
    const configDir = track(fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-cli-requires-')));
    const { server } = await buildServer({ configDir });
    return {
      server,
      providerManifest: path.join(provider, 'dist-module', 'manifest.json'),
      contribManifest: path.join(contributorDir, 'dist-module', 'manifest.json'),
      contributorDir,
    };
  }

  function register(server: Awaited<ReturnType<typeof buildServer>>['server'], id: string, manifestPath: string) {
    return server.inject({ method: 'POST', url: '/api/modules/register', payload: { id, source: { type: 'file', path: manifestPath } } });
  }

  it('serves the contribution on /api/slots/prov:shared-slot once the provider is loaded', async () => {
    const { server, providerManifest, contribManifest } = await setup();
    try {
      expect((await register(server, 'prov', providerManifest)).statusCode).toBe(201);
      expect((await register(server, 'contrib', contribManifest)).statusCode).toBe(201);
      const res = await server.inject({ method: 'GET', url: '/api/slots/prov:shared-slot' });
      expect(res.json()).toEqual([{ $type: 'Badge', label: 'c' }]);
    } finally {
      await server.close();
    }
  });

  it('refuses the contributor before the provider is loaded, with the fix', async () => {
    const { server, contribManifest } = await setup();
    try {
      const res = await register(server, 'contrib', contribManifest);
      expect(res.statusCode).toBe(422);
      expect((res.json() as { error: string }).error).toMatch(/module "prov" is not loaded[\s\S]*Fix: Register "prov" first/);
    } finally {
      await server.close();
    }
  });

  it('refuses at load a contributed view whose root $type became forbidden after packaging', async () => {
    const { server, providerManifest, contribManifest, contributorDir } = await setup();
    try {
      expect((await register(server, 'prov', providerManifest)).statusCode).toBe(201);
      fs.writeFileSync(path.join(contributorDir, 'dist-module', 'manifest.json'), fs.readFileSync(contribManifest, 'utf8').replace('"Badge"', '"Form"'));
      const res = await register(server, 'contrib', contribManifest);
      expect(res.statusCode).toBe(422);
      expect((res.json() as { error: string }).error).toMatch(/"Form".*accepts only: Badge[\s\S]*Fix:/);
      expect((await server.inject({ method: 'GET', url: '/api/slots/prov:shared-slot' })).json()).toEqual([]);
    } finally {
      await server.close();
    }
  });
});
