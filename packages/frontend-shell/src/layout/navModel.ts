import { modulePagePath } from '../modulePaths.js';
import type { LoadedModuleSummary } from '../types.js';

export interface NavPage {
  moduleId: string;
  routePath: string;
  label: string;
  // A module home page ("/") must not stay highlighted on the module's other pages.
  exact: boolean;
  // A rule above the entry in the side menu, and the caption of the group that follows (from the manifest).
  separatorBefore?: boolean;
  groupLabel?: string;
}

// Base slot: page/nav -> a navigation entry routing to a full-page render (frontend-shell.md "Base slots").
export function navPagesFor(modules: LoadedModuleSummary[]): NavPage[] {
  return modules.flatMap((m) =>
    m.extensionPoints
      .filter((ep) => ep.kind === 'page' && ep.slot === 'nav' && ep.inactive === undefined)
      .map((ep, i) => ({
        moduleId: m.id,
        // A nav page with a static path is linked there; one with route params can only be reached by index.
        routePath: ep.path !== undefined && !ep.path.includes(':') ? modulePagePath(m.id, ep.path) : `/modules/${m.id}/${i}`,
        label: ep.label ?? `${m.id} #${i}`,
        exact: ep.path === '/',
        separatorBefore: ep.separatorBefore,
        groupLabel: ep.groupLabel,
      })),
  );
}

// The module whose side menu a slot targets: `flow:nav` -> "flow". Undefined for any other slot, including the module's own `nav`.
function menuSlotProvider(slot: string): string | undefined {
  const parts = slot.split(':');
  return parts.length === 2 && parts[0] !== '' && parts[1] === 'nav' ? parts[0] : undefined;
}

interface ContributedPage {
  provider: string;
  order: number;
  page: NavPage;
}

// Pages that a module adds to ANOTHER module's side menu (`page` on slot `<provider>:nav`). The page stays the
// contributor's (its route is under /modules/<contributor>), only the menu entry belongs to the provider. A provider
// that is not loaded gets nothing: its contributors fail to load with it. Sorted by `order` (none last), then by
// module order, as every slot is.
function contributedPagesFor(modules: LoadedModuleSummary[]): ContributedPage[] {
  const loaded = new Set(modules.map((m) => m.id));
  return modules
    .flatMap((m) =>
      m.extensionPoints.flatMap((ep): ContributedPage[] => {
        const provider = menuSlotProvider(ep.slot);
        // The server guarantees a static path, a label and the kind `page`; a module that does not is not loaded at all.
        // An inactive contribution (a provider it can do without is not there, or the contract does not hold) is not listed.
        if (provider === undefined || provider === m.id || !loaded.has(provider) || ep.kind !== 'page' || ep.path === undefined || ep.inactive !== undefined) {
          return [];
        }
        return [{ provider, order: ep.order ?? Number.POSITIVE_INFINITY, page: { moduleId: m.id, routePath: modulePagePath(m.id, ep.path), label: ep.label ?? ep.path, exact: ep.path === '/', separatorBefore: ep.separatorBefore, groupLabel: ep.groupLabel } }];
      }),
    )
    .map((entry, seq) => ({ entry, seq }))
    .sort((a, b) => (a.entry.order === b.entry.order ? a.seq - b.seq : a.entry.order - b.entry.order))
    .map(({ entry }) => entry);
}

// One module as the layout sees it: a title (top level) and its pages (side menu).
export interface NavModule {
  id: string;
  title: string;
  // Every page route of the module lives under this prefix; used to find the active module from the URL.
  basePath: string;
  pages: NavPage[];
  // Whether the module is listed (a tab, a dashboard shortcut). A module that is not listed still has its pages in the
  // side menu while one of them is open, and still colors the accent.
  listed: boolean;
}

// The manifest has no display name yet, so the title is derived from the module id ("billing-reports" -> "Billing reports").
export function titleFromId(id: string): string {
  const words = id.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// The side menu of a module: its own `nav` pages in manifest order, then the pages other modules contributed to it.
// Modules without any entry have nothing to show in the navigation and are left out. A module with pages whose
// manifest says `showInNav: false` is kept (its pages must still get a side menu) but is not `listed`.
export function navModulesFor(modules: LoadedModuleSummary[]): NavModule[] {
  const pages = navPagesFor(modules);
  const contributed = contributedPagesFor(modules);
  return modules.flatMap((m): NavModule[] => {
    const menu = [...pages.filter((p) => p.moduleId === m.id), ...contributed.filter((c) => c.provider === m.id).map((c) => c.page)];
    return menu.length > 0 ? [{ id: m.id, title: m.title ?? titleFromId(m.id), basePath: `/modules/${m.id}`, pages: menu, listed: m.showInNav !== false }] : [];
  });
}

// The modules the top bar and the dashboard menu list.
export const listedNavModules = (navModules: NavModule[]): NavModule[] => navModules.filter((m) => m.listed);

// Pseudo-module shown by "always visible" sidebars outside any module (the dashboard): the dashboard itself,
// then one quick-launch entry per module pointing to its first page.
export const HOME_MODULE_ID = '__home';

export function homeNavModule(navModules: NavModule[]): NavModule {
  return {
    id: HOME_MODULE_ID,
    title: 'Dashboard',
    basePath: '/',
    pages: [
      { moduleId: HOME_MODULE_ID, routePath: '/', label: 'Dashboard', exact: true },
      ...listedNavModules(navModules).map((m) => ({ moduleId: m.id, routePath: m.pages[0].routePath, label: m.title, exact: false })),
    ],
    listed: true,
  };
}

function isUnder(pathname: string, basePath: string): boolean {
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

export function activeNavModule(pathname: string, navModules: NavModule[]): NavModule | undefined {
  // A page contributed to another module's menu lives under the contributor's URL but belongs to the module whose menu
  // lists it: that one is active (its tab, its side menu, its accent). The most specific page wins over the base path.
  const contributed = navModules
    .flatMap((m) => m.pages.filter((p) => p.moduleId !== m.id && isPageCurrent(pathname, p)).map((p) => ({ module: m, page: p })))
    .sort((a, b) => b.page.routePath.length - a.page.routePath.length)[0];
  // Longest prefix wins so that a module "a" never captures the pages of a module "a/b"-like base path.
  const byBasePath = navModules
    .filter((m) => isUnder(pathname, m.basePath))
    .sort((a, b) => b.basePath.length - a.basePath.length)[0];
  if (contributed === undefined) {
    return byBasePath;
  }
  // The contributor's own page may be more specific than the contributed one (a deeper route): then it stays the owner's.
  const ownPageLength = byBasePath === undefined ? -1 : Math.max(-1, ...byBasePath.pages.filter((p) => p.moduleId === byBasePath.id && isPageCurrent(pathname, p)).map((p) => p.routePath.length));
  return contributed.page.routePath.length > ownPageLength ? contributed.module : byBasePath;
}

// Whether `page` is the page being viewed. An `exact` page (a module home, "/") matches only its own path, so it does
// not stay highlighted on the module's other pages; any other page also matches the routes below it.
export function isPageCurrent(pathname: string, page: NavPage): boolean {
  return page.exact ? pathname === page.routePath : isUnder(pathname, page.routePath);
}

export function activeNavPage(pathname: string, module: NavModule): NavPage | undefined {
  return module.pages.find((p) => isPageCurrent(pathname, p));
}
