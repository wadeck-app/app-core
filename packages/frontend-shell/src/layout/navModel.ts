import { modulePagePath } from '../modulePaths.js';
import type { LoadedModuleSummary } from '../types.js';

export interface NavPage {
  moduleId: string;
  routePath: string;
  label: string;
  // A module home page ("/") must not stay highlighted on the module's other pages.
  exact: boolean;
}

// Base slot: page/nav -> a navigation entry routing to a full-page render (frontend-shell.md "Base slots").
export function navPagesFor(modules: LoadedModuleSummary[]): NavPage[] {
  return modules.flatMap((m) =>
    m.extensionPoints
      .filter((ep) => ep.kind === 'page' && ep.slot === 'nav')
      .map((ep, i) => ({
        moduleId: m.id,
        // A nav page with a static path is linked there; one with route params can only be reached by index.
        routePath: ep.path !== undefined && !ep.path.includes(':') ? modulePagePath(m.id, ep.path) : `/modules/${m.id}/${i}`,
        label: ep.label ?? `${m.id} #${i}`,
        exact: ep.path === '/',
      })),
  );
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

// Modules without any page/nav entry have nothing to show in the navigation and are left out. A module with pages
// whose manifest says `showInNav: false` is kept (its pages must still get a side menu) but is not `listed`.
export function navModulesFor(modules: LoadedModuleSummary[]): NavModule[] {
  const pages = navPagesFor(modules);
  return modules.flatMap((m): NavModule[] => {
    const own = pages.filter((p) => p.moduleId === m.id);
    return own.length > 0 ? [{ id: m.id, title: titleFromId(m.id), basePath: `/modules/${m.id}`, pages: own, listed: m.showInNav !== false }] : [];
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
  // Longest prefix wins so that a module "a" never captures the pages of a module "a/b"-like base path.
  return navModules
    .filter((m) => isUnder(pathname, m.basePath))
    .sort((a, b) => b.basePath.length - a.basePath.length)[0];
}

// Whether `page` is the page being viewed. An `exact` page (a module home, "/") matches only its own path, so it does
// not stay highlighted on the module's other pages; any other page also matches the routes below it.
export function isPageCurrent(pathname: string, page: NavPage): boolean {
  return page.exact ? pathname === page.routePath : isUnder(pathname, page.routePath);
}

export function activeNavPage(pathname: string, module: NavModule): NavPage | undefined {
  return module.pages.find((p) => isPageCurrent(pathname, p));
}
