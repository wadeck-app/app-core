import * as fs from 'node:fs';

export interface OrderResult<T> {
  // Every item that is not part of a cycle, required modules before the modules that require them.
  ordered: T[];
  // Members of a require cycle: id -> the cycle as "a -> b -> a", seen from that member.
  cycles: Map<string, string>;
}

// Topological order from `requires` (Kahn, ties broken by the original order so the result is stable).
// Required ids that are not among the items are ignored: the loader reports them when it loads the
// dependent. Modules that merely depend on a cycle stay in `ordered`; their load fails with the
// provider's failure, which names the cycle.
export function orderByRequires<T extends { id: string }>(items: T[], requiresOf: (item: T) => string[]): OrderResult<T> {
  const byId = new Map(items.map((item) => [item.id, item]));
  const requires = new Map(items.map((item) => [item.id, requiresOf(item).filter((id) => byId.has(id))]));

  const done = new Set<string>();
  const ordered: T[] = [];
  const firstReady = (): T | undefined =>
    items.find((item) => !done.has(item.id) && (requires.get(item.id) ?? []).every((id) => done.has(id)));
  // Always the first ready item in original order, so a dependent lands right after what it requires.
  for (let next = firstReady(); next !== undefined; next = firstReady()) {
    done.add(next.id);
    ordered.push(next);
  }

  const stuck = items.filter((item) => !done.has(item.id));
  const cycles = new Map<string, string>();
  for (const item of stuck) {
    const path = cyclePath(item.id, requires, new Set(stuck.map((s) => s.id)));
    if (path !== undefined) {
      cycles.set(item.id, path.join(' -> '));
    }
  }
  // Stuck but not in a cycle: depends on one. Kept, in original order, so its load reports the failed provider.
  ordered.push(...stuck.filter((item) => !cycles.has(item.id)));
  return { ordered, cycles };
}

// Path from `start` back to `start` through the stuck modules, or undefined when `start` is not on a cycle.
function cyclePath(start: string, requires: Map<string, string[]>, stuck: Set<string>): string[] | undefined {
  const visited = new Set<string>();
  const walk = (id: string, trail: string[]): string[] | undefined => {
    for (const next of requires.get(id) ?? []) {
      if (next === start) {
        return [...trail, start];
      }
      if (stuck.has(next) && !visited.has(next)) {
        visited.add(next);
        const found = walk(next, [...trail, next]);
        if (found !== undefined) {
          return found;
        }
      }
    }
    return undefined;
  };
  return walk(start, [start]);
}

// The ids a packaged manifest requires, read without validating the rest of it. An unreadable or invalid
// manifest yields none: it cannot be ordered, and its own load reports the real error.
export function readRequiredIds(manifestPath: string): string[] {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const requires = typeof raw === 'object' && raw !== null ? (raw as { requires?: unknown }).requires : undefined;
    return typeof requires === 'object' && requires !== null ? Object.keys(requires) : [];
  } catch {
    return [];
  }
}
