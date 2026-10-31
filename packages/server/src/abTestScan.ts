import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LoadedModule } from './loader.js';

// How many A/B tests the installed modules declare, over all their pages (the dock only shows those mounted on the current page).
// Two kinds, and they do not have the same reliability:
//  - `view`: a `$type: AbTest` node in a view of the module (a page, a widget, a slot contribution, a variant of another test).
//    Read from the parsed views: exact.
//  - `component`: a `useAbTest({ id, label, ... })` call in the React code the module ships (its dsl-lib). Read from the text of
//    the bundle: the calls are counted and their labels read when they are literal. An estimate, because the code is the module's
//    own: a call in a component that never mounts counts, a hook called through another name or with a label that is not a
//    literal is missed or unnamed, and two calls with the same id count twice.

export interface ViewAbTest {
  source: 'view';
  moduleId: string;
  id: string;
  label: string | undefined;
  // Where it sits: the extension point (kind, slot, path or label).
  where: string;
}

export interface ComponentAbTest {
  source: 'component';
  moduleId: string;
  // Literal label of the call; undefined when the code builds it.
  label: string | undefined;
}

export interface AbTestInventory {
  // Exact.
  views: ViewAbTest[];
  // Estimated.
  components: ComponentAbTest[];
  // Modules that ship components the scan could not read (missing or unreadable file): their tests, if any, are not in the count.
  unreadable: Array<{ moduleId: string; reason: string }>;
}

function walkViews(node: unknown, visit: (node: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) {
    node.forEach((child) => walkViews(child, visit));
    return;
  }
  if (typeof node !== 'object' || node === null) {
    return;
  }
  const record = node as Record<string, unknown>;
  if (record['$type'] === 'AbTest') {
    visit(record);
  }
  Object.values(record).forEach((child) => walkViews(child, visit));
}

function describePoint(ep: LoadedModule['resolvedViews'][number]): string {
  return [ep.kind, ep.slot, ep.path ?? ep.label].filter((part) => part !== undefined && part !== '').join(' ');
}

// The `$type: AbTest` nodes of one module's views. A test repeated with the same id is one test (the node allows it).
export function scanViews(mod: Pick<LoadedModule, 'id' | 'resolvedViews'>): ViewAbTest[] {
  const seen = new Set<string>();
  const found: ViewAbTest[] = [];
  for (const ep of mod.resolvedViews) {
    walkViews(ep.view, (node) => {
      const id = typeof node['id'] === 'string' ? node['id'] : undefined;
      if (id === undefined || seen.has(id)) {
        return;
      }
      seen.add(id);
      found.push({ source: 'view', moduleId: mod.id, id, label: typeof node['label'] === 'string' ? node['label'] : undefined, where: describePoint(ep) });
    });
  }
  return found;
}

// `useAbTest)({id:..., label:"..."`: the form a bundler leaves of `useAbTest({ id, label, ... })` imported from the shared
// dsl-ui. The label is looked for in the 300 characters after the call opens.
const CALL = /\buseAbTest\)\(\{/g;
const LITERAL_LABEL = /\blabel:\s*"((?:[^"\\]|\\.)*)"/;

export function scanComponentText(moduleId: string, text: string): ComponentAbTest[] {
  const found: ComponentAbTest[] = [];
  for (const match of text.matchAll(CALL)) {
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 300);
    const label = LITERAL_LABEL.exec(after)?.[1];
    found.push({ source: 'component', moduleId, label });
  }
  return found;
}

// The bundle is read again only when it changed (modification time and size), since the inventory is asked for often.
const cache = new Map<string, { key: string; found: ComponentAbTest[] }>();

async function scanComponents(mod: LoadedModule): Promise<{ found: ComponentAbTest[] } | { reason: string }> {
  const entry = mod.manifest.dslLib?.entry;
  if (entry === undefined) {
    return { found: [] };
  }
  const file = path.resolve(mod.manifestDir, entry);
  try {
    const { mtimeMs, size } = await fs.promises.stat(file);
    const key = `${mtimeMs}-${size}`;
    const cached = cache.get(file);
    if (cached?.key === key) {
      return { found: cached.found };
    }
    const found = scanComponentText(mod.id, await fs.promises.readFile(file, 'utf8'));
    cache.set(file, { key, found });
    return { found };
  } catch (err) {
    return { reason: `cannot read ${file}: ${(err as Error).message}` };
  }
}

export async function inventoryAbTests(modules: readonly LoadedModule[]): Promise<AbTestInventory> {
  const inventory: AbTestInventory = { views: [], components: [], unreadable: [] };
  for (const mod of modules) {
    inventory.views.push(...scanViews(mod));
    const components = await scanComponents(mod);
    if ('reason' in components) {
      inventory.unreadable.push({ moduleId: mod.id, reason: components.reason });
    } else {
      inventory.components.push(...components.found);
    }
  }
  return inventory;
}
