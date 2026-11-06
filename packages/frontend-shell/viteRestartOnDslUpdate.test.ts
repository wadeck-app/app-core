import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { entriesGeneratorUrl, installedDslVersions, sameVersions } from './viteRestartOnDslUpdate';

const roots: string[] = [];
function installed(versions: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsl-'));
  roots.push(root);
  for (const [name, version] of Object.entries(versions)) {
    fs.mkdirSync(path.join(root, 'node_modules', name), { recursive: true });
    fs.writeFileSync(path.join(root, 'node_modules', name, 'package.json'), JSON.stringify({ name, version }));
  }
  return root;
}
afterEach(() => roots.splice(0).forEach((r) => fs.rmSync(r, { recursive: true, force: true })));

describe('installedDslVersions', () => {
  it('reads the installed versions of dsl-ui and dsl-renderer', () => {
    const root = installed({ '@wadeck-app/dsl-ui': '2', '@wadeck-app/dsl-renderer': '3' });
    expect(installedDslVersions(root)).toEqual({ '@wadeck-app/dsl-ui': '2', '@wadeck-app/dsl-renderer': '3' });
  });

  it('says "missing" for a package that is not installed (npm may be half way), so it counts as a change', () => {
    const before = installedDslVersions(installed({ '@wadeck-app/dsl-ui': '2', '@wadeck-app/dsl-renderer': '3' }));
    const during = installedDslVersions(installed({ '@wadeck-app/dsl-renderer': '3' }));
    expect(during['@wadeck-app/dsl-ui']).toBe('missing');
    expect(sameVersions(before, during)).toBe(false);
  });
});

describe('sameVersions', () => {
  it('is true for the same versions and false when either package changed', () => {
    const a = { '@wadeck-app/dsl-ui': '2', '@wadeck-app/dsl-renderer': '3' };
    expect(sameVersions(a, { ...a })).toBe(true);
    expect(sameVersions(a, { ...a, '@wadeck-app/dsl-ui': '4' })).toBe(false);
    expect(sameVersions(a, { ...a, '@wadeck-app/dsl-renderer': '4' })).toBe(false);
  });
});

describe('entriesGeneratorUrl', () => {
  // Where the generator is installed does not matter (hoisted or nested): the version is the one of the package it belongs to.
  function generatorIn(root: string, version: string): string {
    const dir = path.join(root, 'node_modules', '@wadeck-app', 'dsl-renderer');
    fs.mkdirSync(path.join(dir, 'dist', 'build'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: '@wadeck-app/dsl-renderer', version }));
    return pathToFileURL(path.join(dir, 'dist', 'build', 'entriesGenerator.js')).href;
  }
  const rootDir = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsl-'));
    roots.push(root);
    return root;
  };

  it('keeps the file and adds the version of its dsl-renderer as query, so a new version is evaluated again', () => {
    const v3 = generatorIn(rootDir(), '3');
    const v4 = generatorIn(rootDir(), '4');
    expect(entriesGeneratorUrl(v3)).toBe(`${v3}?dsl=3`);
    expect(entriesGeneratorUrl(v4)).toBe(`${v4}?dsl=4`);
    expect(entriesGeneratorUrl(`${v3}?dsl=old`)).toBe(`${v3}?dsl=3`);
  });

  it('says what to do when the package of the generator cannot be found', () => {
    const lonely = pathToFileURL(path.join(rootDir(), 'dist', 'build', 'entriesGenerator.js')).href;
    expect(() => entriesGeneratorUrl(lonely)).toThrow('Cannot find the package.json of @wadeck-app/dsl-renderer');
  });
});

describe('dslFreshLoader', () => {
  // The hook is plain ESM next to vite.config.ts; the real proof (a module deep in the graph is evaluated again after a restart)
  // is the marker experiment described in the commit that added it.
  const next = async (specifier: string) => ({ url: new URL(specifier, 'file:///r/dist/build/entriesGenerator.js').href });
  const load = async () => (await import('./dslFreshLoader.mjs')) as { resolve: (s: string, c: { parentURL?: string }, n: typeof next) => Promise<{ url: string }> };

  it('hands the version query of a module to the relative modules it imports, and to theirs in turn', async () => {
    const { resolve } = await load();
    const child = await resolve('./dslConfig.js', { parentURL: 'file:///r/dist/build/entriesGenerator.js?dsl=3' }, next);
    expect(child.url).toBe('file:///r/dist/build/dslConfig.js?dsl=3');
    const grandChild = await resolve('../dslKeys.js', { parentURL: child.url }, next);
    expect(grandChild.url).toBe('file:///r/dist/dslKeys.js?dsl=3');
  });

  it('leaves alone what is not a relative import from a versioned module (bare packages, modules without the query)', async () => {
    const { resolve } = await load();
    expect((await resolve('ts-morph', { parentURL: 'file:///r/a.js?dsl=3' }, async () => ({ url: 'file:///n/ts-morph/index.js' }))).url).toBe('file:///n/ts-morph/index.js');
    expect((await resolve('./b.js', { parentURL: 'file:///r/a.js' }, next)).url).toBe('file:///r/dist/build/b.js');
    expect((await resolve('./b.js', {}, next)).url).toBe('file:///r/dist/build/b.js');
  });
});
