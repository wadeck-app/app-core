import { modulePagePath } from './modulePaths.js';
import type { LoadedModuleSummary } from './types.js';
import type { PointRef } from './useAbTestInventory.js';

// Where to go to see something that lives in an extension point of a module.
export interface Place {
  href: string;
  // What it is, for reading.
  text: string;
  // What the link does not say: a route with a parameter leads to the list it hangs from, not to the page itself.
  note?: string;
}

const moduleName = (modules: readonly LoadedModuleSummary[], id: string): string => modules.find((m) => m.id === id)?.title ?? id;

// The static address of the deepest page of the module that is a start of `pattern` ("/executions/:id/logs" -> "/executions"),
// or the module home. A route with a parameter cannot be opened without a value for it.
function ancestorAddress(module: LoadedModuleSummary | undefined, moduleId: string, pattern: string): string {
  const fixed = pattern.split('/').slice(0, pattern.split('/').findIndex((segment) => segment.startsWith(':')));
  for (let length = fixed.length; length > 0; length--) {
    const candidate = fixed.slice(0, length).join('/');
    if (candidate === '') {
      break;
    }
    if (module?.extensionPoints.some((ep) => ep.kind === 'page' && ep.path === candidate)) {
      return modulePagePath(moduleId, candidate);
    }
  }
  return `/modules/${moduleId}`;
}

export function placeOf(modules: readonly LoadedModuleSummary[], point: PointRef): Place {
  const name = moduleName(modules, point.moduleId);
  const module = modules.find((m) => m.id === point.moduleId);
  const title = point.label ?? point.path ?? point.slot;
  if (point.kind === 'widget') {
    if (point.slot === 'dashboard') {
      return { href: '/', text: `Dashboard, widget "${title}" of ${name}` };
    }
    if (point.slot === 'navbar' || point.slot === 'overlay') {
      return { href: '/', text: `${point.slot === 'navbar' ? 'Top bar' : 'Overlay'} widget "${title}" of ${name}`, note: 'shown on every page' };
    }
    const provider = point.slot.split(':')[0] ?? point.moduleId;
    return { href: `/modules/${provider}`, text: `Slot ${point.slot}, contributed by ${name}`, note: `rendered on the pages of ${moduleName(modules, provider)} that show this slot` };
  }
  if (point.kind === 'page') {
    if (point.path === undefined) {
      // Addressed by its position among the nav pages of the module, as the side menu does.
      const navIndex = (module?.extensionPoints ?? []).slice(0, point.index + 1).filter((ep) => ep.kind === 'page' && ep.slot === 'nav').length - 1;
      return { href: navIndex >= 0 ? `/modules/${point.moduleId}/${navIndex}` : `/modules/${point.moduleId}`, text: `${name}: ${title}` };
    }
    if (point.path.includes(':')) {
      return { href: ancestorAddress(module, point.moduleId, point.path), text: `${name}: ${title} (${point.path})`, note: 'a page of one item: open an item of this list' };
    }
    return { href: modulePagePath(point.moduleId, point.path), text: `${name}: ${title} (${point.path})` };
  }
  return { href: `/modules/${point.moduleId}`, text: `${name}: ${point.kind} ${point.slot}` };
}
