import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildServer } from '@wadeck-app/app-core-server/server';
import { checkModule } from './check.js';
import { packageModule } from './package.js';
import { makeModule, removeModule } from './test-helpers/makeModule.js';

const dirs: string[] = [];
const track = (dir: string): string => (dirs.push(dir), dir);

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    removeModule(dir);
  }
});

// `prov` offers the slot "shared-slot" (Badge only). `contrib` can do without it.
const PROVIDER_MANIFEST = {
  id: 'prov',
  extensionPoints: [{ kind: 'widget', slot: 'dashboard', view: { type: 'inline', value: { $type: 'Badge', label: 'p' } } }],
  expose: { slots: { 'shared-slot': { accepts: ['Badge'] } } },
};

const providerFiles = (): Record<string, string | null> => ({
  'manifest.json': JSON.stringify(PROVIDER_MANIFEST, null, 2),
  'package.json': JSON.stringify({ name: '@x/prov', files: ['dist-module'] }),
  'src/dsl-views/home.yaml': null,
});

function contributorManifest(view: Record<string, unknown> = { $type: 'Badge', label: 'c' }, extra: Record<string, unknown> = {}): string {
  return JSON.stringify(
    {
      id: 'contrib',
      optionalRequires: { prov: '^1.0.0' },
      extensionPoints: [{ kind: 'widget', slot: 'prov:shared-slot', view: { type: 'inline', value: view } }],
      ...extra,
    },
    null,
    2,
  );
}

const contributorFiles = (manifest = contributorManifest()): Record<string, string | null> => ({
  'manifest.json': manifest,
  'package.json': JSON.stringify({ name: '@x/contrib', files: ['dist-module'], dependencies: { '@x/prov': '^1.0.0' } }),
  'src/dsl-views/home.yaml': null,
});

async function packagedProvider(): Promise<string> {
  const dir = track(makeModule(providerFiles()));
  await packageModule({ moduleDir: dir, outDir: path.join(dir, 'dist-module'), version: '1.2.0' });
  return dir;
}

describe('check: optionalRequires', () => {
  it('passes with one warning, not an error, when the optional provider cannot be found', async () => {
    const dir = track(makeModule(contributorFiles()));
    const result = await checkModule(dir);
    expect(result.issues).toEqual([]);
    expect(result.warnings).toEqual([expect.stringContaining('optional module "prov" is not available')]);
    expect(result.warnings[0]).toContain('--link prov=<folder of the provider>');
  });

  it('says it once per provider, however many contributions it has', async () => {
    const manifest = JSON.stringify({
      id: 'contrib',
      optionalRequires: { prov: '*' },
      extensionPoints: [
        { kind: 'widget', slot: 'prov:shared-slot', view: { type: 'inline', value: { $type: 'Badge' } } },
        { kind: 'widget', slot: 'prov:shared-slot', view: { type: 'inline', value: { $type: 'Badge' } }, order: 2 },
      ],
    });
    const result = await checkModule(track(makeModule(contributorFiles(manifest))));
    expect(result.issues).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });

  it('validates as a required provider would be when the provider is there: no warning when it holds', async () => {
    const provider = await packagedProvider();
    const result = await checkModule(track(makeModule(contributorFiles())), { links: { '@x/prov': provider } });
    expect(result).toMatchObject({ issues: [], warnings: [] });
  });

  it('reports a root $type the slot does not accept as an error, with its fix, when the provider is there', async () => {
    const provider = await packagedProvider();
    const dir = track(makeModule(contributorFiles(contributorManifest({ $type: 'Card', title: 'x' }))));
    const { issues } = await checkModule(dir, { links: { '@x/prov': provider } });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.problem).toContain('contributes a "Card" to "prov:shared-slot", which accepts only: Badge');
    expect(issues[0]?.fix).toContain('Change the root $type');
  });

  it('reports a slot the provider does not expose', async () => {
    const provider = await packagedProvider();
    const manifest = JSON.stringify({
      id: 'contrib',
      optionalRequires: { prov: '*' },
      extensionPoints: [{ kind: 'widget', slot: 'prov:nope', view: { type: 'inline', value: { $type: 'Badge' } } }],
    });
    const { issues } = await checkModule(track(makeModule(contributorFiles(manifest))), { links: { '@x/prov': provider } });
    expect(issues[0]?.problem).toContain('does not expose the slot "nope"');
  });

  it('reports an invalid range and an id listed in both keys', async () => {
    const badRange = await checkModule(track(makeModule(contributorFiles(contributorManifest(undefined, { optionalRequires: { prov: 'nope' } })))));
    expect(badRange.issues[0]?.problem).toContain('optionalRequires "prov" has an invalid semver range');
    const both = await checkModule(track(makeModule(contributorFiles(contributorManifest(undefined, { requires: { prov: '*' } })))));
    expect(both.issues[0]?.problem).toContain('"prov" is in both "requires" and "optionalRequires"');
  });

  it('still asks for a declaration when the module contributes to a module it lists in neither key', async () => {
    const manifest = JSON.stringify({ id: 'contrib', extensionPoints: [{ kind: 'widget', slot: 'prov:shared-slot', view: { type: 'inline', value: { $type: 'Badge' } } }] });
    const provider = await packagedProvider();
    const { issues } = await checkModule(track(makeModule(contributorFiles(manifest))), { links: { '@x/prov': provider } });
    expect(issues[0]?.fix).toContain('"optionalRequires" if this module can work without prov');
  });
});

describe('check: --link <module id>=<folder> for a provider the module does not depend on', () => {
  // The package of the provider is "@x/prov" and the module id is "prov"; the contributor does not list the package at all.
  const noDependency = (): Record<string, string | null> => ({ ...contributorFiles(), 'package.json': JSON.stringify({ name: '@x/contrib', files: ['dist-module'] }) });

  it('finds the provider by its module id, and validates against it', async () => {
    const provider = await packagedProvider();
    const dir = track(makeModule(noDependency()));
    expect(await checkModule(dir, { links: { prov: provider } })).toMatchObject({ issues: [], warnings: [] });

    const wrong = track(makeModule({ ...noDependency(), 'manifest.json': contributorManifest({ $type: 'Card', title: 'x' }) }));
    const { issues } = await checkModule(wrong, { links: { prov: provider } });
    expect(issues[0]?.problem).toContain('contributes a "Card" to "prov:shared-slot", which accepts only: Badge');
  });

  it('says why a link does not work instead of falling back to the dependencies: not built, or another module', async () => {
    const notBuilt = track(makeModule(providerFiles()));
    const dir = track(makeModule(noDependency()));
    const first = await checkModule(dir, { links: { prov: notBuilt } });
    expect(first.warnings[0]).toContain('--link prov=');
    expect(first.warnings[0]).toContain('not a module folder, or not built');

    const other = track(makeModule({ ...providerFiles(), 'manifest.json': JSON.stringify({ ...PROVIDER_MANIFEST, id: 'other' }) }));
    await packageModule({ moduleDir: other, outDir: path.join(other, 'dist-module'), version: '1.0.0' });
    const second = await checkModule(dir, { links: { prov: other } });
    expect(second.warnings[0]).toContain('that folder holds module "other", not "prov"');
  });

  it('works for a required provider too', async () => {
    const provider = await packagedProvider();
    const manifest = contributorManifest(undefined, { optionalRequires: undefined, requires: { prov: '^1.0.0' } });
    const dir = track(makeModule({ ...noDependency(), 'manifest.json': manifest }));
    expect((await checkModule(dir, { links: { prov: provider } })).issues).toEqual([]);
  });
});

describe('package: optionalRequires', () => {
  it('writes the key into the manifest the server loads, and carries the warning of check', async () => {
    const dir = track(makeModule(contributorFiles()));
    const result = await packageModule({ moduleDir: dir, outDir: path.join(dir, 'dist-module'), version: '2.0.0' });
    const packaged = JSON.parse(fs.readFileSync(path.join(dir, 'dist-module', 'manifest.json'), 'utf8')) as { optionalRequires?: unknown; requires?: unknown };
    expect(packaged.optionalRequires).toEqual({ prov: '^1.0.0' });
    expect(packaged.requires).toBeUndefined();
    expect(result.warnings.some((w) => w.includes('optional module "prov" is not available'))).toBe(true);
  });
});

describe('real server: a module packaged by the CLI that can do without its provider', () => {
  async function register(server: Awaited<ReturnType<typeof buildServer>>['server'], id: string, manifest: string) {
    return server.inject({ method: 'POST', url: '/api/modules/register', payload: { id, source: { type: 'file', path: manifest } } });
  }

  it('loads alone, is inactive with a reason, becomes active when the provider loads, and survives the provider leaving', async () => {
    const provider = await packagedProvider();
    const contributor = track(makeModule(contributorFiles()));
    await packageModule({ moduleDir: contributor, outDir: path.join(contributor, 'dist-module'), version: '2.0.0' });
    const configDir = track(fs.mkdtempSync(path.join(path.dirname(contributor), 'app-core-cli-optional-cfg-')));
    const { server } = await buildServer({ configDir, publicDir: path.join(configDir, 'none') });
    try {
      expect((await register(server, 'contrib', path.join(contributor, 'dist-module', 'manifest.json'))).statusCode).toBe(201);
      const alone = (await server.inject({ method: 'GET', url: '/api/modules' })).json() as { modules: Array<{ id: string; warnings?: string[]; extensionPoints: Array<{ inactive?: string }> }> };
      expect(alone.modules[0]?.extensionPoints[0]?.inactive).toContain('optional module "prov" is not available');
      expect(alone.modules[0]?.warnings).toHaveLength(1);
      expect((await server.inject({ method: 'GET', url: '/api/slots/prov:shared-slot' })).json()).toEqual([]);

      expect((await register(server, 'prov', path.join(provider, 'dist-module', 'manifest.json'))).statusCode).toBe(201);
      expect((await server.inject({ method: 'GET', url: '/api/slots/prov:shared-slot' })).json()).toEqual([{ $type: 'Badge', label: 'c' }]);

      await server.inject({ method: 'POST', url: '/api/modules/unregister', payload: { id: 'prov' } });
      const after = (await server.inject({ method: 'GET', url: '/api/modules' })).json() as { modules: Array<{ id: string }>; failed: unknown[] };
      expect(after.modules.map((m) => m.id)).toEqual(['contrib']);
      expect(after.failed).toEqual([]);
    } finally {
      await server.close();
    }
  });
});
