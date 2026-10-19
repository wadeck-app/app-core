import { matchPath } from 'react-router-dom';
import { modulePagePath } from '../modulePaths.js';
import type { LoadedModuleSummary } from '../types.js';
import { activeNavModule, activeNavPage, type NavModule } from './navModel.js';

// "Flow Executions" under the Flow tab says "Flow" twice: the label without the module name in front ("Executions").
// A label that is only the module name, or that does not start with it, is left alone.
export function trimModulePrefix(label: string, moduleTitle: string): string {
  const prefix = `${moduleTitle} `;
  if (!label.toLowerCase().startsWith(prefix.toLowerCase())) {
    return label;
  }
  const rest = label.slice(prefix.length).trim();
  return rest === '' ? label : rest.charAt(0).toUpperCase() + rest.slice(1);
}

export interface Crumb {
  label: string;
  // Absent on the last crumb: it is where the user is.
  href?: string;
}

// Where the user is, as a trail: the module, its page, and for a deeper route (a detail page, a form) the route's own
// label. Empty on the dashboard and on a URL that belongs to no module.
export function breadcrumbFor(pathname: string, navModules: NavModule[], modules: LoadedModuleSummary[]): Crumb[] {
  const module = activeNavModule(pathname, navModules);
  if (module === undefined) {
    return [];
  }
  const trail: Crumb[] = [{ label: module.title, href: module.pages[0]?.routePath }];
  const page = activeNavPage(pathname, module);
  if (page !== undefined) {
    trail.push({ label: page.label, href: page.routePath });
  }

  // A route below the menu page: the most specific extension point of the module (or of the page's owner) that matches the URL.
  const owner = page?.moduleId ?? module.id;
  const route = (modules.find((m) => m.id === owner)?.extensionPoints ?? [])
    .filter((ep) => ep.kind === 'page' && ep.path !== undefined && ep.label !== undefined)
    .map((ep) => ({ ep, pattern: modulePagePath(owner, ep.path as string) }))
    .filter(({ pattern }) => matchPath({ path: pattern, end: true }, pathname) !== null)
    .sort((a, b) => b.pattern.length - a.pattern.length)[0];
  if (route !== undefined && route.ep.label !== page?.label) {
    trail.push({ label: route.ep.label as string });
  }

  // The last crumb is the current place, not a link.
  const last = trail[trail.length - 1];
  if (last !== undefined) {
    delete last.href;
  }
  return trail;
}

export interface RecentPage {
  routePath: string;
  label: string;
  moduleId: string;
}

// The page just visited goes first; an earlier visit of the same page is dropped; at most `max` are kept.
export function pushRecent(recent: readonly RecentPage[], page: RecentPage, max: number): RecentPage[] {
  return [page, ...recent.filter((r) => r.routePath !== page.routePath)].slice(0, max);
}
