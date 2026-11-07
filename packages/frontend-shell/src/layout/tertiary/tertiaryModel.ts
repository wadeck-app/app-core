import { generatePath, matchPath, useLocation } from 'react-router-dom';
import { modulePagePath } from '../../modulePaths.js';
import type { LoadedModuleSummary } from '../../types.js';

export interface TertiaryItem {
  id: string;
  label: string;
  href: string;
  // A figure next to the label (open items, unread alerts). No manifest field fills it yet; the tabs show it when it is there.
  count?: number;
}

export interface TertiaryNav {
  items: readonly TertiaryItem[];
  activeId: string;
}

export const NO_TERTIARY: TertiaryNav = { items: [], activeId: '' };

// The third level of the page at `pathname`: the pages of its module that share the `tab.group` of the page shown, as tabs, in the order
// of `tab.order` (declaration order when absent). Each tab is the address of its page with the ":params" of the page shown filled in
// (the manifest checks that a group's pages take the same ones). A page that is not a tab, or whose group has no other page, has no
// third level: nothing is shown.
export function tertiaryFor(modules: readonly LoadedModuleSummary[], pathname: string): TertiaryNav {
  for (const module of modules) {
    const pages = module.extensionPoints.filter((ep) => ep.kind === 'page' && ep.path !== undefined && ep.inactive === undefined);
    // The page shown is the one whose address fits the URL with the fewest parameters ("/tasks/new" before "/tasks/:id").
    const shown = pages
      .map((ep) => ({ ep, match: matchPath({ path: modulePagePath(module.id, ep.path as string), end: true }, pathname) }))
      .filter((c) => c.match !== null)
      .sort((a, b) => Object.keys(a.match!.params).length - Object.keys(b.match!.params).length)[0];
    if (shown?.ep.tab === undefined || shown.match === null) {
      continue;
    }
    const group = shown.ep.tab.group;
    const tabs = pages
      .map((ep, index) => ({ ep, index }))
      .filter(({ ep }) => ep.tab?.group === group)
      .sort((a, b) => (a.ep.tab!.order ?? Number.POSITIVE_INFINITY) - (b.ep.tab!.order ?? Number.POSITIVE_INFINITY) || a.index - b.index);
    if (tabs.length < 2) {
      return NO_TERTIARY;
    }
    const items = tabs.map(({ ep }) => ({
      id: ep.path as string,
      label: ep.tab!.label,
      href: generatePath(modulePagePath(module.id, ep.path as string), shown.match!.params),
    }));
    return { items, activeId: shown.ep.path as string };
  }
  return NO_TERTIARY;
}

export function useTertiaryNav(modules: readonly LoadedModuleSummary[]): TertiaryNav {
  const { pathname } = useLocation();
  return tertiaryFor(modules, pathname);
}
