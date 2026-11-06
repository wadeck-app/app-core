import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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
  it('points at the generator of the installed dsl-renderer and changes with its version, so a restart evaluates it again', () => {
    const v1 = entriesGeneratorUrl(installed({ '@wadeck-app/dsl-ui': '2', '@wadeck-app/dsl-renderer': '3' }));
    const v2 = entriesGeneratorUrl(installed({ '@wadeck-app/dsl-ui': '2', '@wadeck-app/dsl-renderer': '4' }));
    expect(v1.startsWith('file:///')).toBe(true);
    expect(v1.endsWith('/node_modules/@wadeck-app/dsl-renderer/dist/build/entriesGenerator.js?dsl=3')).toBe(true);
    expect(v2.endsWith('?dsl=4')).toBe(true);
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
