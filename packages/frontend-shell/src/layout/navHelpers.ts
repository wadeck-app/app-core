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

const segmentsOf = (path: string): string[] => path.split('/').filter((s) => s !== '');
const isParam = (segment: string): boolean => segment.startsWith(':');
const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
const shorten = (value: string): string => (value.length > 16 ? `${value.slice(0, 15)}...` : value);

// What a route is called when its extension point has no label: its last fixed segment, in the singular when a parameter
// follows ("/executions/:id" -> "Execution"). A module should give a label; this keeps the trail readable when it does not.
function derivedLabel(pattern: string): string {
  const fixed = segmentsOf(pattern).filter((s) => !isParam(s));
  const last = fixed[fixed.length - 1] ?? 'page';
  const word = last.replace(/[-_]+/g, ' ');
  const endsWithParam = isParam(segmentsOf(pattern).at(-1) ?? '');
  return capitalize(endsWithParam && word.endsWith('s') && word.length > 3 ? word.slice(0, -1) : word);
}

interface RouteCandidate {
  label: string;
  depth: number;
  params: number;
  href: string;
}

// The pages of a module on the way to the URL, from the outermost to the page shown: every page whose address is the
// start of the URL ("/tasks", "/tasks/:id", "/tasks/:id/history" for /tasks/7/history). Where several match at the same
// depth ("/jobs/new" and "/jobs/:id" for /jobs/new) the one with the fewest parameters wins. A parameter at the end of the
// address shows its value ("Task 7"). The module home ("/") is a parent only of pages that no other menu page claims.
function routeChain(ownerId: string, modules: LoadedModuleSummary[], pathname: string, homeIsParent: boolean): RouteCandidate[] {
  const candidates: RouteCandidate[] = [];
  for (const ep of modules.find((m) => m.id === ownerId)?.extensionPoints ?? []) {
    if (ep.kind !== 'page' || ep.path === undefined) {
      continue;
    }
    if (ep.path === '/' && !homeIsParent) {
      continue;
    }
    const pattern = modulePagePath(ownerId, ep.path);
    const match = matchPath({ path: pattern, end: false }, pathname);
    if (match === null) {
      continue;
    }
    const segments = segmentsOf(ep.path);
    const last = segments[segments.length - 1];
    const value = last !== undefined && isParam(last) ? match.params[last.slice(1)] : undefined;
    const base = ep.label ?? derivedLabel(ep.path);
    candidates.push({
      label: value === undefined ? base : `${base} ${shorten(decodeURIComponent(value))}`,
      depth: segments.length,
      params: segments.filter(isParam).length,
      href: match.pathnameBase,
    });
  }
  const bestAtDepth = new Map<number, RouteCandidate>();
  for (const candidate of candidates) {
    const best = bestAtDepth.get(candidate.depth);
    if (best === undefined || candidate.params < best.params) {
      bestAtDepth.set(candidate.depth, candidate);
    }
  }
  return [...bestAtDepth.values()].sort((a, b) => a.depth - b.depth);
}

// Where the user is, as a trail of nested pages: the module, then every page on the way to this one (see routeChain),
// each linking to its own address and the last being the current place. Empty on the dashboard and on a URL that belongs
// to no module.
export function breadcrumbFor(pathname: string, navModules: NavModule[], modules: LoadedModuleSummary[]): Crumb[] {
  const module = activeNavModule(pathname, navModules);
  if (module === undefined) {
    return [];
  }
  const page = activeNavPage(pathname, module);
  const owner = page?.moduleId ?? module.id;
  const trail: Crumb[] = [{ label: module.title, href: module.pages[0]?.routePath }];
  // The menu page being shown comes first; it may have no path (a page addressed by its index) and then it is the only one.
  if (page !== undefined) {
    trail.push({ label: page.label, href: page.routePath });
  }
  for (const route of routeChain(owner, modules, pathname, page === undefined)) {
    // The menu page is already in the trail under the same address (the module crumb, which may link to the same address, does not count).
    if (!trail.slice(1).some((c) => c.href === route.href)) {
      trail.push({ label: route.label, href: route.href });
    }
  }
  // The last crumb is the current place, not a link.
  const last = trail[trail.length - 1];
  if (last !== undefined) {
    delete last.href;
  }
  return trail;
}
