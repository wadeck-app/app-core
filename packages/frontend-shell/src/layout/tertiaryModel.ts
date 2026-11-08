import { generatePath, matchPath, useLocation } from 'react-router-dom';
import { modulePagePath } from '../modulePaths.js';
import type { LoadedModuleSummary, ResolvedExtensionPoint } from '../types.js';
import type { Indicator } from './indicator.js';
import { indicatorRequest, type IndicatorRequest } from './useIndicators.js';

export interface TertiaryItem {
  id: string;
  label: string;
  href: string;
  // The id of the entry for the pages that set its indicator themselves: `<moduleId><path>`.
  entryId: string;
  // A number or an icon next to the label (open items, an alert), once read from `indicatorRequest` or set by the page.
  indicator?: Indicator;
  // Where to read it: the `tab.count` of the page, its route filled with the parameters of the page shown.
  indicatorRequest?: IndicatorRequest;
}

export interface TertiaryNav {
  items: readonly TertiaryItem[];
  activeId: string;
}

export const NO_TERTIARY: TertiaryNav = { items: [], activeId: '' };

// "flow:execution" is the group "execution" of the module "flow"; "execution" in the module "task" is the group of "task".
function ownerOfGroup(moduleId: string, group: string): { owner: string; name: string } {
  const at = group.indexOf(':');
  return at < 0 ? { owner: moduleId, name: group } : { owner: group.slice(0, at), name: group.slice(at + 1) };
}

interface Candidate {
  module: LoadedModuleSummary;
  ep: ResolvedExtensionPoint;
  path: string;
}

// The third level of the page at `pathname`: the pages that share the tab group of the page shown, as tabs, in the order of
// `tab.order` (declaration order when absent). A group belongs to the module that declares it; other modules can join it with
// "<module>:<group>", so the tabs can be pages of several modules. Each tab is the address of its page with the ":params" of the page
// shown filled in (the manifest checks that a group's pages take the same ones). A page that is not a tab, or whose group has no
// other page, has no third level: nothing is shown.
export function tertiaryFor(modules: readonly LoadedModuleSummary[], pathname: string, hidden: ReadonlySet<string> = new Set()): TertiaryNav {
  const pages: Candidate[] = modules.flatMap((module) =>
    module.extensionPoints.filter((ep) => ep.kind === 'page' && ep.path !== undefined && ep.inactive === undefined).map((ep) => ({ module, ep, path: ep.path as string })),
  );
  // The page shown is the one whose address fits the URL with the fewest parameters ("/tasks/new" before "/tasks/:id").
  const shown = pages
    .map((c) => ({ c, match: matchPath({ path: modulePagePath(c.module.id, c.path), end: true }, pathname) }))
    .filter((x) => x.match !== null)
    .sort((a, b) => Object.keys(a.match!.params).length - Object.keys(b.match!.params).length)[0];
  if (shown?.c.ep.tab === undefined || shown.match === null) {
    return NO_TERTIARY;
  }
  const { owner, name } = ownerOfGroup(shown.c.module.id, shown.c.ep.tab.group);
  const members = pages
    .map((c, index) => ({ c, index }))
    .filter(({ c }) => c.ep.tab !== undefined && (({ owner: o, name: n }) => o === owner && n === name)(ownerOfGroup(c.module.id, c.ep.tab.group)))
    .sort((a, b) => (a.c.ep.tab!.order ?? Number.POSITIVE_INFINITY) - (b.c.ep.tab!.order ?? Number.POSITIVE_INFINITY) || a.index - b.index);
  const idOf = (c: Candidate): string => `${c.module.id}${c.path}`;
  // A page can hide the tabs that make no sense for the item shown (`useEntryHidden`); the tab you are on stays.
  const visible = members.filter(({ c }) => c === shown.c || !hidden.has(idOf(c)));
  if (visible.length < 2) {
    return NO_TERTIARY;
  }
  return {
    items: visible.map(({ c }) => ({
      id: idOf(c),
      label: c.ep.tab!.label,
      href: generatePath(modulePagePath(c.module.id, c.path), shown.match!.params),
      entryId: idOf(c),
      ...(c.ep.tab!.count === undefined ? {} : { indicatorRequest: indicatorRequest(`tab:${idOf(c)}`, c.module.id, c.ep.tab!.count, shown.match!.params) }),
    })),
    activeId: idOf(shown.c),
  };
}

export function useTertiaryNav(modules: readonly LoadedModuleSummary[], hidden?: ReadonlySet<string>): TertiaryNav {
  const { pathname } = useLocation();
  return tertiaryFor(modules, pathname, hidden);
}
