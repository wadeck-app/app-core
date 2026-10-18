// Built-in components are rendered by the shell's generated registry, which has no node schema to validate
// against (`nodeSchema` is null) and silently ignores unknown keys. Every container reads its child nodes from
// `items`; the only built-in reading a `children` key is FieldWrapper (a typed prop, not a node list). A view that
// writes `children:` therefore renders an empty container: no error, no alert. Enforced against the registry by
// the shell test "registry child key contract" (packages/frontend-shell/src/fixtureViews.render.test.tsx).
const CHILDREN_READERS = new Set(['FieldWrapper']);

// "$.items[1]" style paths of the nodes that have a `children` key and no `items` key, built-in components only
// (a "<moduleId>:<Name>" dsl-lib component defines its own props).
export function findIgnoredChildren(view: unknown, at = '$'): string[] {
  if (Array.isArray(view)) {
    return view.flatMap((value, index) => findIgnoredChildren(value, `${at}[${index}]`));
  }
  if (typeof view !== 'object' || view === null) {
    return [];
  }
  const type: unknown = Reflect.get(view, '$type');
  const found: string[] = [];
  if (typeof type === 'string' && !type.includes(':') && !CHILDREN_READERS.has(type) && 'children' in view && !('items' in view)) {
    found.push(`${at} (${type})`);
  }
  for (const [key, value] of Object.entries(view)) {
    found.push(...findIgnoredChildren(value, `${at}.${key}`));
  }
  return found;
}

export function ignoredChildrenWarnings(view: unknown, where: string): string[] {
  return findIgnoredChildren(view).map(
    (node) =>
      `${where}: ${node} has a "children" key, which built-in components ignore, so it renders empty with no error. Containers read their child nodes from "items:" (rename "children:" to "items:").`,
  );
}
