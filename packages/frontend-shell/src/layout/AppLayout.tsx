import React, { useCallback, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Puzzle } from 'lucide-react';
import { AbDock, AppShell, useRootAccent, type ShellItem, type ShellLinkProps, type ShellMenu } from '@wadeck-app/dsl-ui';
import { Breadcrumb } from './Breadcrumb.js';
import { Logo, moduleColor } from './Logo.js';
import { breadcrumbFor, trimModulePrefix, type Crumb, type RecentPage } from './navHelpers.js';
import { HOME_MODULE_ID, activeNavModule, homeNavModule, isPageCurrent, listedNavModules, titleFromId, type NavModule } from './navModel.js';
import { QuickSwitcher, useSwitcherShortcut } from './QuickSwitcher.js';
import { SwitcherButton } from './SwitcherButton.js';
import { TopBarActions } from './TopBarActions.js';
import { MAX_RECENT, useRecentPages } from './useRecentPages.js';
import { useNavExperiments } from './useNavExperiments.js';
import type { LayoutProps } from './types.js';

const routerLink = ({ href, children, ...rest }: ShellLinkProps): React.ReactElement => (
  <Link to={href} {...rest}>
    {children}
  </Link>
);

const DASHBOARD_TAB_ID = '__dashboard';

// The module tabs in the order the experiment asks for: as registered, A to Z, or the modules used last first.
const orderedTabs = (listed: NavModule[], order: 'registered' | 'alpha' | 'recent', recent: RecentPage[]): NavModule[] => {
  if (order === 'alpha') {
    return [...listed].sort((a, b) => a.title.localeCompare(b.title));
  }
  if (order === 'recent') {
    const rank = (id: string): number => {
      const at = recent.findIndex((r) => r.moduleId === id);
      return at === -1 ? Number.MAX_SAFE_INTEGER : at;
    };
    // Array.sort is stable: modules never visited keep their registered order.
    return [...listed].sort((a, b) => rank(a.id) - rank(b.id));
  }
  return listed;
};

// The trail says the pages the way the menu does: without the module name in front when the menu labels are trimmed.
const trailFor = (crumbs: Crumb[], labels: 'full' | 'trimmed'): Crumb[] =>
  labels === 'full' || crumbs.length < 2 ? crumbs : crumbs.map((c, i) => (i === 0 ? c : { ...c, label: trimModulePrefix(c.label, crumbs[0]?.label ?? '') }));

// The app layout: adapts app-core's module model and the router to the generic AppShell. Top bar = brand + one tab per
// module (colored 2-letter logo and name); left = the pages of the active module in an always-visible menu, or the
// quick-launch list of modules on the dashboard.
// The accent color (dsl-ui's --color-primary*) follows the module being viewed; the dashboard keeps the default.
export function AppLayout({ modules, navModules, failed = [], children }: LayoutProps): React.ReactElement {
  const { pathname } = useLocation();
  const active = activeNavModule(pathname, navModules);
  const experiments = useNavExperiments();
  const recent = useRecentPages(pathname, navModules);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const toggleSwitcher = useCallback(() => setSwitcherOpen((open) => !open), []);
  useSwitcherShortcut(experiments.switcher !== 'off', toggleSwitcher);
  // On the document, not on a subtree: the popovers and dialogs of the pages are rendered in portals and must follow the accent too.
  useRootAccent(active ? moduleColor(active.id) : undefined);

  const tabs: ShellItem[] = [
    { id: DASHBOARD_TAB_ID, label: 'Dashboard', href: '/', current: pathname === '/' ? 'page' : undefined },
    ...orderedTabs(listedNavModules(navModules), experiments.tabOrder, recent).map((m) => ({
      id: m.id,
      label: m.title,
      href: m.pages[0].routePath,
      icon: experiments.tabs === 'both' ? <Logo title={m.title} moduleId={m.id} /> : undefined,
      current: active?.id === m.id ? ('true' as const) : undefined,
      accent: moduleColor(m.id),
    })),
  ];

  const menuModule = active ?? homeNavModule(navModules);
  const onDashboard = menuModule.id === HOME_MODULE_ID;
  const titleOf = (id: string): string => navModules.find((m) => m.id === id)?.title ?? titleFromId(id);

  // The dashboard menu: the modules, every page of every module, or the pages opened last.
  const dashboardItems: ShellMenu['items'] =
    experiments.dashMenu === 'all-pages'
      ? [
          { id: '/', label: 'Dashboard', href: '/', current: pathname === '/' ? 'page' : undefined },
          ...listedNavModules(navModules).flatMap((m) =>
            m.pages.map((p) => ({ id: p.routePath, label: `${m.title}: ${p.label}`, href: p.routePath, icon: <Logo title={m.title} moduleId={m.id} />, current: isPageCurrent(pathname, p) ? ('page' as const) : undefined })),
          ),
        ]
      : experiments.dashMenu === 'recent' && recent.length > 0
        ? [
            { id: '/', label: 'Dashboard', href: '/', current: pathname === '/' ? ('page' as const) : undefined },
            ...recent.slice(0, MAX_RECENT).map((r) => ({ id: r.routePath, label: `${titleOf(r.moduleId)}: ${r.label}`, href: r.routePath, icon: <Logo title={titleOf(r.moduleId)} moduleId={r.moduleId} /> })),
          ]
        : [];

  const menu: ShellMenu = {
    title: menuModule.title,
    label: `${menuModule.title} pages`,
    items:
      onDashboard && dashboardItems.length > 0
        ? dashboardItems
        : menuModule.pages.map((p) => {
            // A page another module added to this menu: marked, as the experiment says.
            const added = !onDashboard && p.moduleId !== menuModule.id;
            return {
              id: p.routePath,
              label: onDashboard || experiments.labels === 'full' ? p.label : trimModulePrefix(p.label, menuModule.title),
              href: p.routePath,
              // The dashboard menu lists modules: each gets its logo.
              icon: onDashboard ? (
                <Logo title={p.label} moduleId={p.moduleId} />
              ) : added && experiments.contrib === 'logo' ? (
                <Logo title={titleOf(p.moduleId)} moduleId={p.moduleId} />
              ) : added && experiments.contrib === 'puzzle' ? (
                <Puzzle className="h-4 w-4 text-muted" aria-label={`Added by ${titleOf(p.moduleId)}`} />
              ) : undefined,
              current: isPageCurrent(pathname, p) ? ('page' as const) : undefined,
            };
          }),
  };

  const actions = (
    <>
      {experiments.switcher === 'button' ? <SwitcherButton onClick={toggleSwitcher} /> : null}
      <TopBarActions modules={modules} failed={failed} />
    </>
  );

  return (
    <>
      <AppShell
        brand="app-core"
        tabs={tabs}
        tabsLabel="Modules"
        menu={menu}
        actions={actions}
        renderLink={routerLink}
        skipLabel="Skip to content"
        // Lists the tabs that do not fit, so a module is never unreachable when there are many.
        moreLabel="More modules"
      >
        {experiments.breadcrumb === 'none' ? null : <Breadcrumb mode={experiments.breadcrumb} crumbs={trailFor(breadcrumbFor(pathname, navModules, modules), experiments.labels)} />}
        {children}
      </AppShell>
      {experiments.switcher === 'off' ? null : <QuickSwitcher navModules={navModules} open={switcherOpen} onOpenChange={setSwitcherOpen} />}
      {experiments.hosted ? null : <AbDock tests={experiments.tests} />}
    </>
  );
}
