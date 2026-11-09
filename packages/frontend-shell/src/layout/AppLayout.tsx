import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AppShell, useRootAccent, type ShellItem, type ShellLinkProps, type ShellMenu } from '@wadeck-app/dsl-ui';
import { Breadcrumb } from './Breadcrumb.js';
import { Logo, moduleColor } from './Logo.js';
import { NavSettings } from './NavSettings.js';
import { breadcrumbFor, trimModulePrefix, type Crumb } from './navHelpers.js';
import { HOME_MODULE_ID, activeNavModule, homeNavModule, isPageCurrent, listedNavModules } from './navModel.js';
import { TopBarActions } from './TopBarActions.js';
import { applyTabOrder, useTabOrder } from './useTabOrder.js';
import { useTertiaryNav } from './tertiaryModel.js';
import { TertiaryTabs } from './TertiaryTabs.js';
import { useHiddenEntries, usePushedIndicators } from './indicatorBus.js';
import { indicatorRequest, useIndicators, type IndicatorRequest } from './useIndicators.js';
import type { LayoutProps } from './types.js';

const routerLink = ({ href, children, ...rest }: ShellLinkProps): React.ReactElement => (
  <Link to={href} {...rest}>
    {children}
  </Link>
);

const DASHBOARD_TAB_ID = '__dashboard';

// The trail says the pages the way the menu does: without the module name in front ("Executions", not "Flow Executions").
// The first crumb is the module itself and is left as it is.
const trimmedTrail = (crumbs: Crumb[]): Crumb[] => crumbs.map((c, i) => (i === 0 ? c : { ...c, label: trimModulePrefix(c.label, crumbs[0]?.label ?? '') }));

// The app layout: adapts app-core's module model and the router to the generic AppShell. Top bar = brand + one tab per
// module (colored 2-letter logo and name, in the order the user chose); left = the pages of the active module in an
// always-visible menu, or the quick-launch list of modules on the dashboard; above the page, the trail of nested pages.
// The accent color (dsl-ui's --color-primary*) follows the module being viewed; the dashboard keeps the default.
export function AppLayout({ modules, navModules, failed = [], standalone, children }: LayoutProps): React.ReactElement {
  const { pathname } = useLocation();
  const active = activeNavModule(pathname, navModules);
  const tabOrder = useTabOrder();
  // On the document, not on a subtree: the popovers and dialogs of the pages are rendered in portals and must follow the accent too.
  useRootAccent(active ? moduleColor(active.id) : undefined);

  const listed = applyTabOrder(listedNavModules(navModules), tabOrder.saved);
  // A standalone application has one module: nothing to switch between, so no tabs (the dashboard is not part of it either).
  const tabs: ShellItem[] = standalone !== undefined ? [] : [
    { id: DASHBOARD_TAB_ID, label: 'Dashboard', href: '/', current: pathname === '/' ? 'page' : undefined },
    ...listed.map((m) => ({
      id: m.id,
      label: m.title,
      href: m.pages[0].routePath,
      icon: <Logo title={m.title} moduleId={m.id} />,
      current: active?.id === m.id ? ('true' as const) : undefined,
      accent: moduleColor(m.id),
    })),
  ];

  const menuModule = active ?? (standalone === undefined ? undefined : navModules.find((m) => m.id === standalone.moduleId)) ?? homeNavModule(navModules);
  const onDashboard = menuModule.id === HOME_MODULE_ID;
  // The third level: the pages of the module that share a `tab.group` with the page shown, as tabs under the trail, in the same sticky
  // block. A page without one shows nothing.
  const tertiary = useTertiaryNav(modules, useHiddenEntries());
  const tabsOn = tertiary.items.length > 0;
  const currentPage = menuModule.pages.find((p) => isPageCurrent(pathname, p));
  const pageTitle = currentPage === undefined ? menuModule.title : trimModulePrefix(currentPage.label, menuModule.title);
  const crumbs = trimmedTrail(breadcrumbFor(pathname, navModules, modules));
  // What sits next to the entries of the side menu and next to the tabs: read from routes of the modules and kept up to date, or set by
  // a component of a page (it wins: it knows the page better than the last answer of a route).
  const requests = [
    ...menuModule.pages.flatMap((p) => (p.countSource === undefined ? [] : [indicatorRequest(`menu:${p.entryId}`, p.moduleId, p.countSource)])),
    ...tertiary.items.flatMap((i) => [i.indicatorRequest]),
  ].filter((r): r is IndicatorRequest => r !== undefined);
  const read = useIndicators(requests);
  const pushed = usePushedIndicators();
  const tertiaryWithIndicators = { ...tertiary, items: tertiary.items.map((i) => ({ ...i, indicator: pushed[i.entryId] ?? read[`tab:${i.entryId}`] })) };
  const menu: ShellMenu = {
    title: menuModule.title,
    label: `${menuModule.title} pages`,
    // A page that asks for a separator gets a rule (and a caption) above its entry; the shell drops one that leads or trails.
    items: menuModule.pages.flatMap((p): ShellMenu['items'] => [
      ...(p.separatorBefore === true ? [{ kind: 'separator' as const, id: `separator:${p.routePath}`, label: p.groupLabel }] : []),
      {
        id: p.routePath,
        // The tab already says the module: its pages are named without it.
        label: onDashboard ? p.label : trimModulePrefix(p.label, menuModule.title),
        href: p.routePath,
        // The dashboard menu lists modules: each gets its logo.
        icon: onDashboard ? <Logo title={p.label} moduleId={p.moduleId} /> : undefined,
        current: isPageCurrent(pathname, p) ? ('page' as const) : undefined,
        // The whole indicator (number or icon, tone, label): dsl-ui draws it and gives it its tooltip.
        badge: pushed[p.entryId] ?? read[`menu:${p.entryId}`],
      },
    ]),
  };

  const actions = (
    <>
      {standalone === undefined ? <NavSettings modules={listed} customized={tabOrder.saved.length > 0} onSave={tabOrder.save} onReset={tabOrder.reset} /> : null}
      <TopBarActions modules={modules} failed={failed} />
    </>
  );

  return (
    <AppShell
      brand={standalone === undefined ? 'app-core' : menuModule.title}
      tabs={tabs}
      tabsLabel="Modules"
      menu={menu}
      actions={actions}
      renderLink={routerLink}
      skipLabel="Skip to content"
      // Lists the tabs that do not fit, so a module is never unreachable when there are many.
      moreLabel="More modules"
      // Decided: about half the height once the page is scrolled, full again at the top.
      barOnScroll="shrink"
      // Decided: the user drags the edge of the menu to the width they want (kept in this browser).
      menuVariant="resizable"
      // The name of the drag handle of the `resizable` menu.
      resizeLabel="Resize the side menu"
    >
      {/* Decided: the trail sticks under the top bar, with the tabs of the third level under it when there are some: one block, because
          two sticky bars would stick at the same place and hide each other. */}
      {crumbs.length > 0 || tabsOn ? (
        <div className={`sticky top-shell-bar z-10 border-b border-border bg-bg ${tabsOn ? '' : 'pb-2'}`}>
          <Breadcrumb crumbs={crumbs} />
          {tabsOn ? <TertiaryTabs nav={tertiaryWithIndicators} label={`${pageTitle} sections`} /> : null}
        </div>
      ) : null}
      {children}
    </AppShell>
  );
}
