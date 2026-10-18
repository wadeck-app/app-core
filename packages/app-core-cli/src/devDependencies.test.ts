import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveDevDependencies } from './devDependencies.js';

const roots: string[] = [];

afterEach(() => {
  for (const dir of roots.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function scratch(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-cli-devdeps-'));
  roots.push(dir);
  return dir;
}

interface FakePackage {
  // Package name (the dependency name other packages list).
  name: string;
  // Module id; its built manifest is written unless `built` is false.
  id: string;
  requires?: string[];
  built?: boolean;
  // Written as a source module (manifest.json + src/) instead of a package with a build output.
  source?: boolean;
}

// Writes <base>/<folder>/ for each package: package.json listing `requires` packages as dependencies, and a built dist-module.
function writePackage(base: string, pkg: FakePackage, dependencyNames: string[]): string {
  const dir = path.join(base, pkg.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: pkg.name, dependencies: Object.fromEntries(dependencyNames.map((n) => [n, '*'])) }),
  );
  if (pkg.source === true) {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ id: pkg.id, extensionPoints: [{ kind: 'widget', slot: 'dashboard', label: 'x', view: { type: 'inline', value: { $type: 'Badge', label: 'x' } } }] }));
  }
  if (pkg.built !== false && pkg.source !== true) {
    fs.mkdirSync(path.join(dir, 'dist-module'), { recursive: true });
    const requires = Object.fromEntries((pkg.requires ?? []).map((id) => [id, '*']));
    fs.writeFileSync(
      path.join(dir, 'dist-module', 'manifest.json'),
      JSON.stringify({ id: pkg.id, version: '1.2.3', backendEntryPath: './api-backend/backend.cjs', ...(pkg.requires ? { requires } : {}), extensionPoints: [{ kind: 'widget', slot: 'dashboard', label: 'x', view: { type: 'inline', value: { $type: 'Badge', label: 'x' } } }] }),
    );
  }
  return dir;
}

// Builds a set of packages; every package lists the packages of the ids it requires as dependencies.
// Returns the --link map (package name -> folder) so no node_modules is needed.
function world(packages: FakePackage[]): { base: string; links: Record<string, string>; dirOf: (id: string) => string } {
  const base = scratch();
  const byId = new Map(packages.map((p) => [p.id, p]));
  const links: Record<string, string> = {};
  for (const pkg of packages) {
    const deps = (pkg.requires ?? []).map((id) => byId.get(id)?.name ?? `unknown-${id}`);
    links[pkg.name] = writePackage(base, pkg, deps);
  }
  return { base, links, dirOf: (id) => path.join(base, id) };
}

function pkg(id: string, requires: string[] = [], extra: Partial<FakePackage> = {}): FakePackage {
  return { name: `@acme/${id}`, id, requires, ...extra };
}

describe('resolveDevDependencies', () => {
  it('resolves a chain a -> b -> c, dependencies first', () => {
    const w = world([pkg('a', ['b']), pkg('b', ['c']), pkg('c')]);
    const result = resolveDevDependencies({ id: 'a', dir: w.dirOf('a'), requires: ['b'] }, w.links);
    expect(result.map((d) => d.id)).toEqual(['c', 'b']);
    expect(result[0]?.requiredBy).toEqual(['b']);
    expect(result[1]?.manifestPath).toBe(path.join(w.dirOf('b'), 'dist-module', 'manifest.json'));
    expect(result[1]?.version).toBe('1.2.3');
    expect(result[1]?.via).toBe('link');
  });

  it('resolves a diamond once per id and records every requirer', () => {
    const w = world([pkg('a', ['b', 'c']), pkg('b', ['d']), pkg('c', ['d']), pkg('d')]);
    const result = resolveDevDependencies({ id: 'a', dir: w.dirOf('a'), requires: ['b', 'c'] }, w.links);
    expect(result.map((d) => d.id)).toEqual(['d', 'b', 'c']);
    expect(result[0]?.requiredBy).toEqual(['b', 'c']);
  });

  it('finds a dependency in node_modules when no link is given', () => {
    const base = scratch();
    const module = path.join(base, 'mod');
    fs.mkdirSync(module, { recursive: true });
    fs.writeFileSync(path.join(module, 'package.json'), JSON.stringify({ name: 'mod', dependencies: { '@acme/p': '*' } }));
    writePackage(path.join(module, 'node_modules', '@acme'), pkg('p'), []);
    // writePackage names the folder after the id: node_modules/@acme/p
    const result = resolveDevDependencies({ id: 'mod', dir: module, requires: ['p'] }, {});
    expect(result.map((d) => [d.id, d.via])).toEqual([['p', 'node_modules']]);
  });

  it('reports a require cycle with its path', () => {
    const w = world([pkg('a', ['b']), pkg('b', ['c']), pkg('c', ['b'])]);
    expect(() => resolveDevDependencies({ id: 'a', dir: w.dirOf('a'), requires: ['b'] }, w.links)).toThrow(/cycle: b -> c -> b/);
  });

  it('reports a cycle that goes back to the module under development', () => {
    const w = world([pkg('a', ['b']), pkg('b', ['a'])]);
    expect(() => resolveDevDependencies({ id: 'a', dir: w.dirOf('a'), requires: ['b'] }, w.links)).toThrow(/cycle: a -> b -> a/);
  });

  it('names the id, who requires it, where it looked and the three fixes when nothing provides it', () => {
    const w = world([pkg('a', ['b']), pkg('b')]);
    // b is required by a but a's package.json is made to list nothing
    fs.writeFileSync(path.join(w.dirOf('a'), 'package.json'), JSON.stringify({ name: '@acme/a' }));
    const attempt = (): unknown => resolveDevDependencies({ id: 'a', dir: w.dirOf('a'), requires: ['b'] }, w.links);
    expect(attempt).toThrow(/Module "b" \(required by "a"\).*package\.json lists no dependency/s);
    expect(attempt).toThrow(/install .*build it.*--link <package>=<folder>/s);
  });

  it('reports a missing transitive dependency from the dependency that requires it', () => {
    const w = world([pkg('a', ['b']), pkg('b', ['c']), pkg('c')]);
    // c is listed by b's package.json but is neither installed nor linked
    delete w.links['@acme/c'];
    expect(() => resolveDevDependencies({ id: 'a', dir: w.dirOf('a'), requires: ['b'] }, w.links)).toThrow(
      /Module "c" \(required by "b"\).*@acme\/c \(not installed\)/s,
    );
  });

  it('tells to build a dependency that is only a source module, and does not package it', () => {
    const w = world([pkg('a', ['b']), pkg('b', [], { source: true })]);
    const attempt = (): unknown => resolveDevDependencies({ id: 'a', dir: w.dirOf('a'), requires: ['b'] }, w.links);
    expect(attempt).toThrow(/Module "b" \(required by "a"\) is a source module.*has not been built.*app-core-cli package/s);
    expect(fs.existsSync(path.join(w.dirOf('b'), 'dist-module'))).toBe(false);
  });

  it('a dependency that is not built and not a source module is reported as missing a built package', () => {
    const w = world([pkg('a', ['b']), pkg('b', [], { built: false })]);
    expect(() => resolveDevDependencies({ id: 'a', dir: w.dirOf('a'), requires: ['b'] }, w.links)).toThrow(
      /no built package.*not a module, or not built/s,
    );
  });

  it('--link overrides the node_modules copy', () => {
    const base = scratch();
    const module = path.join(base, 'mod');
    fs.mkdirSync(module, { recursive: true });
    fs.writeFileSync(path.join(module, 'package.json'), JSON.stringify({ name: 'mod', dependencies: { '@acme/p': '*' } }));
    writePackage(path.join(module, 'node_modules', '@acme'), pkg('p'), []);
    const linkedDir = writePackage(path.join(base, 'elsewhere'), pkg('p'), []);
    const result = resolveDevDependencies({ id: 'mod', dir: module, requires: ['p'] }, { '@acme/p': linkedDir });
    expect(result[0]?.root).toBe(linkedDir);
    expect(result[0]?.via).toBe('link');
  });

  it('returns nothing for a module that requires nothing', () => {
    expect(resolveDevDependencies({ id: 'a', dir: scratch(), requires: [] }, {})).toEqual([]);
  });
});
