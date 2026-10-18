import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericPageRunner, type ComponentRegistryEntry } from '@wadeck-app/dsl-renderer';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { appRegistry, registerModuleEntries, unregisterModuleEntries } from './registry.js';
import { ensureSharedGlobals } from './sharedGlobals.js';

// Regression guard for "blank page, no error anywhere": a view whose container uses the wrong child key
// (`children:` instead of `items:`) parses, validates, packages and renders an empty page without any
// console error, alert or failing test. This renders EVERY extension point view of EVERY packaged fixture
// (dist-module, as the server serves them) through the shell's real registry and the real GenericPageRunner,
// and asserts the output is not blank.
//
// Nothing is skipped silently: no fixture, a fixture without dist-module, an unreadable view or an
// unmatched expectation all throw. The dsl-lib components of a fixture are loaded for real from
// dist-module/dsl-lib/entries.mjs (the shell publishes its shared singletons first, as in production).

const fixturesDir = path.resolve(import.meta.dirname, '../../test-app-modules');

interface ManifestExtensionPoint {
  kind: string;
  slot: string;
  path?: string;
  view: { type: 'path' | 'inline'; value: unknown };
}
interface PackagedManifest {
  id: string;
  extensionPoints: ManifestExtensionPoint[];
  dslLib?: { entry: string };
}
interface FixtureView {
  name: string;
  moduleId: string;
  slot: string;
  routePath?: string;
  view: unknown;
}
interface Fixture {
  dir: string;
  distDir: string;
  manifest: PackagedManifest;
  views: FixtureView[];
}

function loadFixtures(): Fixture[] {
  const fixtures = fs
    .readdirSync(fixturesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('app-module-'))
    .map((entry): Fixture => {
      const dir = path.join(fixturesDir, entry.name);
      const distDir = path.join(dir, 'dist-module');
      const manifestPath = path.join(distDir, 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        throw new Error(`${manifestPath} is missing: the fixtures are not built. Run "node scripts/build-fixtures.mjs" from the repository root (npm run test:app does it for you).`);
      }
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PackagedManifest;
      const views = manifest.extensionPoints.map((ep, index): FixtureView => {
        let view: unknown = ep.view.value;
        if (ep.view.type === 'path') {
          const viewPath = path.resolve(distDir, String(ep.view.value));
          if (!fs.existsSync(viewPath)) {
            throw new Error(`${manifestPath}: extensionPoints[${index}].view.value "${String(ep.view.value)}" does not exist in dist-module.`);
          }
          view = JSON.parse(fs.readFileSync(viewPath, 'utf8'));
        }
        return {
          name: `${entry.name} / ${ep.kind} ${ep.slot}${ep.path ?? ''}`,
          moduleId: manifest.id,
          slot: ep.slot,
          routePath: ep.path,
          view,
        };
      });
      return { dir, distDir, manifest, views };
    });
  if (fixtures.length === 0) {
    throw new Error(`No app-module-* fixture found in ${fixturesDir}: this guard would check nothing.`);
  }
  return fixtures;
}

const fixtures = loadFixtures();
const allViews = fixtures.flatMap((fixture) => fixture.views);
if (allViews.length === 0) {
  throw new Error(`The fixtures in ${fixturesDir} declare no extension point view: this guard would check nothing.`);
}

// Texts each known view must display, keyed by "<manifest id>:<slot>". Every view also gets the generic
// non-blank assertion; a stale key here (no such view any more) fails the last test.
const EXPECTED_TEXT: Record<string, string[]> = {
  'example:nav': ['Example items', 'Served by the backend route /items', 'alpha', 'Beta', 'gamma', 'active', 'idle'],
  // Route page /items/alpha: PageHeader title and subtitle ($route.id), Badge from the item status.
  'example:route': ['Alpha', 'alpha', 'active'],
  'example:dashboard': ['example'],
  'example:navbar': ['ticks:'],
  'example:slot-provider:shared-slot': ['example-contribution'],
  'dsl-lib:nav': ['v1 hello nav-page', 'dsl-ui-badge'],
  'dsl-lib:route': ['v1 item=alpha'],
  'dsl-lib:navbar': ['v1 navbar hi'],
  'dsl-lib:overlay': ['v1 overlay box'],
  'module-b:dashboard': ['fixture-b-widget'],
  'module-b:nav': ['fixture-b-page'],
  'module-c:nav': ['hello from module-c'],
  'module-d:dashboard': ['42'],
};

// Stubbed $sources responses, by "METHOD /path" (the renderer already substituted {placeholders}).
// The two example routes answer what the example backend (src/backend/index.ts) answers: { items: ITEMS }
// and the item itself. The 3 items are hard-coded here rather than imported from the fixture's
// src/commons/items.ts because that file is outside this package (outside its tsconfig and bundling),
// and the example's own tests pin the backend to it.
const EXAMPLE_ITEMS = [
  { id: 'alpha', name: 'Alpha', status: 'active' },
  { id: 'beta', name: 'Beta', status: 'idle' },
  { id: 'gamma', name: 'Gamma', status: 'active' },
];
function stubbedResponse(url: string): unknown {
  if (url === 'GET /api/modules/example/items') {
    return { items: EXAMPLE_ITEMS };
  }
  const item = /^GET \/api\/modules\/example\/items\/([^/]+)$/.exec(url);
  if (item !== null) {
    const found = EXAMPLE_ITEMS.find((candidate) => candidate.id === item[1]);
    if (found === undefined) {
      throw new Error(`stub: no example item "${item[1]}"`);
    }
    return found;
  }
  // GET /api/slots/<id>: the bare array of contributions; nobody contributes in this test.
  if (/^GET \/api\/slots\/[^/]+$/.test(url)) {
    return [];
  }
  if (url === 'GET /api/modules/module-c/greeting') {
    return { message: 'hello from module-c' };
  }
  if (url === 'GET /api/modules/module-d/count') {
    return { count: 42 };
  }
  throw new Error(`The test fetcher has no stub for "${url}": add one to stubbedResponse() with realistic data.`);
}

const stubFetcher = async (url: string): Promise<unknown> => stubbedResponse(url);

class EventSourceStub {
  onmessage: unknown = null;
  onerror: unknown = null;
  close(): void {}
}

// Every non-whitespace text node under the container.
function textNodes(container: HTMLElement): string[] {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const texts: string[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = (node.textContent ?? '').trim();
    if (text !== '') {
      texts.push(text);
    }
  }
  return texts;
}

const registeredModules: string[] = [];
const matchedExpectations = new Set<string>();

describe('every packaged fixture view renders visible content (not a blank page)', () => {
  beforeAll(async () => {
    stubEventSource();
    await ensureSharedGlobals();
    for (const fixture of fixtures) {
      if (fixture.manifest.dslLib === undefined) {
        continue;
      }
      const entryPath = path.resolve(fixture.distDir, fixture.manifest.dslLib.entry);
      if (!fs.existsSync(entryPath)) {
        throw new Error(`${entryPath} is missing although the manifest of ${fixture.manifest.id} declares dslLib.entry.`);
      }
      const loaded = (await import(/* @vite-ignore */ pathToFileURL(entryPath).href)) as { default?: ComponentRegistryEntry[] };
      if (!Array.isArray(loaded.default)) {
        throw new Error(`${entryPath} must default-export the ComponentRegistryEntry[] array.`);
      }
      registerModuleEntries(fixture.manifest.id, loaded.default);
      registeredModules.push(fixture.manifest.id);
    }
  });

  afterAll(() => {
    for (const id of registeredModules) {
      unregisterModuleEntries(id);
    }
    delete (globalThis as { EventSource?: unknown }).EventSource;
  });

  it.each(allViews.map((view) => [view.name, view] as const))('%s', async (_name, view) => {
    // A route page is mounted on its own path, as the shell does: /modules/<id><path>, ":name" filled with a real id.
    const urlPath = view.routePath === undefined ? '/' : `/modules/${view.moduleId}${view.routePath.replace(/:\w+/g, 'alpha')}`;
    const routePattern = view.routePath === undefined ? '/' : `/modules/${view.moduleId}${view.routePath}`;
    const key = `${view.moduleId}:${view.slot}`;
    const expected = EXPECTED_TEXT[key] ?? [];
    if (expected.length > 0) {
      matchedExpectations.add(key);
    }

    const { container } = render(
      <MemoryRouter initialEntries={[urlPath]}>
        <Routes>
          <Route
            path={routePattern}
            element={<GenericPageRunner yamlText={JSON.stringify(view.view)} registry={appRegistry} fetcher={stubFetcher} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    // Generic: something is on screen once the sources are loaded. For the known views the exact texts
    // are awaited too, so a still-loading view cannot pass and a blank one fails with the DOM printed.
    await waitFor(
      () => {
        expect(textNodes(container), `${view.name} rendered nothing visible. DOM: ${container.innerHTML || '(empty)'}`).not.toHaveLength(0);
        for (const text of expected) {
          expect(container.textContent ?? '', `${view.name} must display "${text}". DOM: ${container.innerHTML}`).toContain(text);
        }
      },
      { timeout: 3000 },
    );
    // A renderer error ("Unknown component type", schema error...) is a visible text too: not a pass.
    expect(container.querySelectorAll('[role="alert"]'), `${view.name} rendered an error: ${container.textContent}`).toHaveLength(0);
  });

  it('has no stale expectation: every EXPECTED_TEXT key matches a fixture view', () => {
    const known = new Set(allViews.map((view) => `${view.moduleId}:${view.slot}`));
    const stale = Object.keys(EXPECTED_TEXT).filter((key) => !known.has(key));
    expect(stale, 'EXPECTED_TEXT keys without a matching fixture view (renamed or removed?)').toEqual([]);
    expect([...matchedExpectations].sort()).toEqual(Object.keys(EXPECTED_TEXT).sort());
  });
});

// jsdom has no EventSource; the example's LiveTicks opens one on mount.
function stubEventSource(): void {
  (globalThis as { EventSource?: unknown }).EventSource = EventSourceStub;
}

describe('registry child key contract', () => {
  // `app-core-cli package` warns about `children:` on built-in nodes (packages/app-core-cli/src/childKeys.ts) because
  // the registry has no node schema and ignores unknown keys. That warning is only right while no built-in component
  // other than FieldWrapper reads node['children']. If this fails, update CHILDREN_READERS in childKeys.ts.
  it('only FieldWrapper reads a "children" key among the built-in components', () => {
    const builtIns = Object.values(appRegistry).filter((entry) => !entry.name.includes(':'));
    expect(builtIns.length).toBeGreaterThan(50);
    const readers = builtIns.filter((entry) => /node\[['"]children['"]\]/.test(entry.render.toString())).map((entry) => entry.name);
    expect(readers).toEqual(['FieldWrapper']);
  });
});
