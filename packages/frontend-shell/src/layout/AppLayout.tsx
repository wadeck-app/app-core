import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AppShell, useRootAccent, type ShellItem, type ShellLinkProps, type ShellMenu } from '@wadeck-app/dsl-ui';
import { Logo, moduleColor } from './Logo.js';
import { HOME_MODULE_ID, activeNavModule, homeNavModule, isPageCurrent, listedNavModules } from './navModel.js';
import { TopBarActions } from './TopBarActions.js';
import type { LayoutProps } from './types.js';

const routerLink = ({ href, children, ...rest }: ShellLinkProps): React.ReactElement => (
  <Link to={href} {...rest}>
    {children}
  </Link>
);

const DASHBOARD_TAB_ID = '__dashboard';

// The app layout: adapts app-core's module model and the router to the generic AppShell. Top bar = brand + one tab per
// module (colored 2-letter logo and name); left = the pages of the active module in an always-visible menu, or the
// quick-launch list of modules on the dashboard.
// The accent color (dsl-ui's --color-primary*) follows the module being viewed; the dashboard keeps the default.
export function AppLayout({ modules, navModules, failed = [], children }: LayoutProps): React.ReactElement {
  const { pathname } = useLocation();
  const active = activeNavModule(pathname, navModules);
  // On the document, not on a subtree: the popovers and dialogs of the pages are rendered in portals and must follow the accent too.
  useRootAccent(active ? moduleColor(active.id) : undefined);

  const tabs: ShellItem[] = [
    { id: DASHBOARD_TAB_ID, label: 'Dashboard', href: '/', current: pathname === '/' ? 'page' : undefined },
    ...listedNavModules(navModules).map((m) => ({
      id: m.id,
      label: m.title,
      href: m.pages[0].routePath,
      icon: <Logo title={m.title} moduleId={m.id} />,
      current: active?.id === m.id ? ('true' as const) : undefined,
      accent: moduleColor(m.id),
    })),
  ];

  const menuModule = active ?? homeNavModule(navModules);
  const onDashboard = menuModule.id === HOME_MODULE_ID;
  const menu: ShellMenu = {
    title: menuModule.title,
    label: `${menuModule.title} pages`,
    items: menuModule.pages.map((p) => ({
      id: p.routePath,
      label: p.label,
      href: p.routePath,
      // The dashboard menu lists modules: each gets its logo.
      icon: onDashboard ? <Logo title={p.label} moduleId={p.moduleId} /> : undefined,
      current: isPageCurrent(pathname, p) ? ('page' as const) : undefined,
    })),
  };

  return (
    <AppShell
      brand="app-core"
      tabs={tabs}
      tabsLabel="Modules"
      menu={menu}
      actions={<TopBarActions modules={modules} failed={failed} />}
      renderLink={routerLink}
      skipLabel="Skip to content"
      // Lists the tabs that do not fit, so a module is never unreachable when there are many.
      moreLabel="More modules"
    >
      {children}
    </AppShell>
  );
}
