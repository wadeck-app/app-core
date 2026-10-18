import { describe, it, expect } from 'vitest';
import { rootTypeOf, validateContributions, type ProviderLookup } from '../src/contributions.js';
import { orderByRequires } from '../src/loadOrder.js';
import { slotIdProblem, splitCustomSlot } from '../src/slotIds.js';
import { parseManifest, parseSourceManifest } from '../src/manifest.js';

const widget = (slot: string) => ({ kind: 'widget', slot, view: { type: 'inline', value: { $type: 'Badge', label: 'x' } } });

describe('slot ids', () => {
  it('accepts the shell slots and <providerId>:<local>', () => {
    for (const slot of ['dashboard', 'nav', 'route', 'navbar', 'overlay', 'slot-provider:shared-slot', 'a_1:b-2']) {
      expect(slotIdProblem(slot), slot).toBeUndefined();
    }
  });

  it('rejects an unprefixed custom slot with the fix', () => {
    expect(slotIdProblem('shared-slot')).toMatch(/not a shell slot.*<providerId>:<slot>/s);
  });

  it('rejects malformed prefixes', () => {
    for (const slot of [':x', 'p:', 'p:a:b', 'p/q:x', 'p:a b']) {
      expect(slotIdProblem(slot), slot).toBeDefined();
    }
  });

  it('splits a custom slot', () => {
    expect(splitCustomSlot('p:s')).toEqual({ providerId: 'p', local: 's' });
    expect(splitCustomSlot('nav')).toBeUndefined();
  });

  it('is enforced by both manifest schemas', () => {
    expect(() => parseManifest({ id: 'x', version: '1.0.0', backendEntryPath: './b.cjs', extensionPoints: [widget('shared-slot')] })).toThrow(/shared-slot.*<providerId>:<slot>/s);
    expect(() => parseSourceManifest({ id: 'x', extensionPoints: [widget('shared-slot')] })).toThrow(/<providerId>:<slot>/);
    expect(parseSourceManifest({ id: 'x', extensionPoints: [widget('p:shared-slot')] }).extensionPoints).toHaveLength(1);
  });
});

describe('manifest requires and expose', () => {
  const base = { id: 'p', extensionPoints: [widget('dashboard')] };

  it('parses requires and expose in the source and output manifests', () => {
    const expose = { types: './src/commons/types.ts', slots: { 'shared-slot': { accepts: ['Badge'] } } };
    const source = parseSourceManifest({ ...base, requires: { other: '^1.0.0' }, expose });
    expect(source.requires).toEqual({ other: '^1.0.0' });
    expect(source.expose?.slots?.['shared-slot']?.accepts).toEqual(['Badge']);
    const output = parseManifest({ ...base, version: '1.0.0', backendEntryPath: './b.cjs', requires: { other: '^1.0.0' }, expose: { ...expose, types: './types/index.d.ts' } });
    expect(output.expose?.types).toBe('./types/index.d.ts');
  });

  it('rejects an invalid required id, an empty accepts list, a bad slot name and unknown keys', () => {
    expect(() => parseSourceManifest({ ...base, requires: { 'a/b': '1' } })).toThrow(/requires/);
    expect(() => parseSourceManifest({ ...base, expose: { slots: { s: { accepts: [] } } } })).toThrow(/accepts/);
    expect(() => parseSourceManifest({ ...base, expose: { slots: { 'a:b': { accepts: ['Badge'] } } } })).toThrow(/expose/);
    expect(() => parseSourceManifest({ ...base, expose: { slots: {}, extra: 1 } })).toThrow(/Unrecognized key/);
  });
});

describe('rootTypeOf', () => {
  it('reads the root $type, never a child one', () => {
    expect(rootTypeOf({ $type: 'Badge', children: [{ $type: 'Form' }] })).toBe('Badge');
    expect(rootTypeOf({ label: 'x' })).toBeUndefined();
    expect(rootTypeOf('x')).toBeUndefined();
    expect(rootTypeOf(null)).toBeUndefined();
  });
});

const providerExpose = { slots: { 'shared-slot': { accepts: ['Badge'] } } };

function lookupOf(providers: Record<string, { version?: string; expose?: typeof providerExpose }>): (id: string) => ProviderLookup {
  return (id) => {
    const provider = providers[id];
    return provider === undefined ? { found: false, why: `provider ${id} is absent`, fix: `provide ${id}` } : { found: true, provider };
  };
}

describe('validateContributions', () => {
  const ok = { index: 0, slot: 'p:shared-slot', rootType: 'Badge' };

  it('passes for a requires-listed provider exposing the slot with an accepted root $type', () => {
    const problems = validateContributions({
      moduleId: 'c',
      requires: { p: '^1.0.0' },
      contributions: [ok, { index: 1, slot: 'dashboard', rootType: 'Anything' }],
      lookup: lookupOf({ p: { version: '1.2.0', expose: providerExpose } }),
      mode: 'load',
    });
    expect(problems).toEqual([]);
  });

  it('requires the provider in requires', () => {
    const [problem, ...rest] = validateContributions({
      moduleId: 'c',
      requires: {},
      contributions: [ok],
      lookup: lookupOf({ p: { expose: providerExpose } }),
      mode: 'package',
    });
    expect(rest).toEqual([]);
    expect(problem).toMatchObject({ about: 'manifest', extensionPointIndex: 0 });
    expect(problem!.problem).toContain('"requires" does not list "p"');
    expect(problem!.fix).toContain('"requires": { "p":');
  });

  it('reports a provider that cannot be found, with the lookup reason and fix', () => {
    const [problem] = validateContributions({ moduleId: 'c', requires: { p: '*' }, contributions: [ok], lookup: lookupOf({}), mode: 'package' });
    expect(problem!.problem).toContain('provider p is absent');
    expect(problem!.fix).toBe('provide p');
  });

  it('reports a slot the provider does not expose, listing the exposed ones', () => {
    const [problem] = validateContributions({
      moduleId: 'c',
      requires: { p: '*' },
      contributions: [{ index: 2, slot: 'p:other', rootType: 'Badge' }],
      lookup: lookupOf({ p: { expose: providerExpose } }),
      mode: 'package',
    });
    expect(problem).toMatchObject({ about: 'manifest', extensionPointIndex: 2 });
    expect(problem!.problem).toContain('does not expose the slot "other"');
    expect(problem!.fix).toContain('shared-slot');
  });

  it('says so when the provider exposes no slot at all', () => {
    const [problem] = validateContributions({ moduleId: 'c', requires: { p: '*' }, contributions: [ok], lookup: lookupOf({ p: {} }), mode: 'package' });
    expect(problem!.fix).toContain('exposes no slot');
  });

  it('rejects a root $type the slot does not accept, and a view with no $type', () => {
    const problems = validateContributions({
      moduleId: 'c',
      requires: { p: '*' },
      contributions: [
        { index: 0, slot: 'p:shared-slot', rootType: 'Form' },
        { index: 1, slot: 'p:shared-slot', rootType: undefined },
      ],
      lookup: lookupOf({ p: { expose: providerExpose } }),
      mode: 'package',
    });
    expect(problems.map((p) => p.about)).toEqual(['view', 'view']);
    expect(problems[0]!.problem).toContain('"Form"');
    expect(problems[0]!.problem).toContain('accepts only: Badge');
    expect(problems[1]!.problem).toContain('no root $type');
  });

  it('validates a contribution to the module own exposed slot against its own expose', () => {
    const problems = validateContributions({
      moduleId: 'p',
      requires: {},
      contributions: [{ index: 0, slot: 'p:shared-slot', rootType: 'Form' }],
      selfExpose: providerExpose,
      lookup: lookupOf({}),
      mode: 'load',
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]!.problem).toContain('"Form"');
  });

  describe('load mode', () => {
    it('reports every required module that is not loaded', () => {
      const [problem] = validateContributions({ moduleId: 'c', requires: { p: '^1.0.0' }, contributions: [], lookup: lookupOf({}), mode: 'load' });
      expect(problem!.problem).toContain('requires "p"');
      expect(problem!.problem).toContain('provider p is absent');
    });

    it('does not repeat the missing provider for each contribution', () => {
      const problems = validateContributions({ moduleId: 'c', requires: { p: '^1.0.0' }, contributions: [ok, { ...ok, index: 1 }], lookup: lookupOf({}), mode: 'load' });
      expect(problems).toHaveLength(1);
    });

    it('reports a version outside the range with both versions and the fix', () => {
      const [problem] = validateContributions({
        moduleId: 'c',
        requires: { p: '^2.0.0' },
        contributions: [],
        lookup: lookupOf({ p: { version: '1.2.0' } }),
        mode: 'load',
      });
      expect(problem!.problem).toContain('"p" "^2.0.0"');
      expect(problem!.problem).toContain('1.2.0');
      expect(problem!.fix).toContain('^2.0.0');
    });

    it('reports a provider version that is not valid semver', () => {
      const [problem] = validateContributions({ moduleId: 'c', requires: { p: '^1.0.0' }, contributions: [], lookup: lookupOf({ p: { version: '2026.10.18-001' } }), mode: 'load' });
      expect(problem!.problem).toContain('not a valid semver version');
    });

    it('accepts a prerelease provider matching a range', () => {
      const problems = validateContributions({ moduleId: 'c', requires: { p: '>=1.0.0-0' }, contributions: [], lookup: lookupOf({ p: { version: '1.0.0-dev' } }), mode: 'load' });
      expect(problems).toEqual([]);
    });
  });

  it('reports an invalid range in both modes', () => {
    for (const mode of ['load', 'package'] as const) {
      const [problem] = validateContributions({ moduleId: 'c', requires: { p: 'not a range' }, contributions: [], lookup: lookupOf({}), mode });
      expect(problem!.problem, mode).toContain('invalid semver range "not a range"');
    }
  });
});

describe('orderByRequires', () => {
  const items = (...ids: string[]) => ids.map((id) => ({ id }));
  const requires = (graph: Record<string, string[]>) => (item: { id: string }) => graph[item.id] ?? [];

  it('keeps the original order when nothing is required', () => {
    expect(orderByRequires(items('a', 'b', 'c'), requires({})).ordered.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('puts a required module before its dependents, stably otherwise', () => {
    const { ordered, cycles } = orderByRequires(items('a', 'b', 'c', 'd'), requires({ a: ['c'], b: ['a'] }));
    expect(ordered.map((i) => i.id)).toEqual(['c', 'a', 'b', 'd']);
    expect(cycles.size).toBe(0);
  });

  it('ignores required ids that are not registered (the loader reports them)', () => {
    expect(orderByRequires(items('a'), requires({ a: ['ghost'] })).ordered.map((i) => i.id)).toEqual(['a']);
  });

  it('reports the members of a cycle with its path, and still returns every other module', () => {
    const { ordered, cycles } = orderByRequires(items('a', 'b', 'c', 'd'), requires({ a: ['b'], b: ['a'], c: ['a'] }));
    expect([...cycles.keys()].sort()).toEqual(['a', 'b']);
    expect(cycles.get('a')).toBe('a -> b -> a');
    expect(cycles.get('b')).toBe('b -> a -> b');
    expect(ordered.map((i) => i.id).sort()).toEqual(['c', 'd']);
  });

  it('detects a module requiring itself', () => {
    const { cycles } = orderByRequires(items('a'), requires({ a: ['a'] }));
    expect(cycles.get('a')).toBe('a -> a');
  });
});
