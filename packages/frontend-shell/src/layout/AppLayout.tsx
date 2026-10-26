import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AppShell, useRootAccent, type ShellItem, type ShellLinkProps, type ShellMenu } from '@wadeck-app/dsl-ui';
import { Breadcrumb } from './Breadcrumb.js';
import { Logo, moduleColor } from './Logo.js';
import { NavSettings } from './NavSettings.js';
import { breadcrumbFor, trimModulePrefix, type Crumb } from './navHelpers.js';
import { HOME_MODULE_ID, activeNavModule, homeNavModule, isPageCurrent, listedNavModules } from './navModel.js';
import { TopBarActions } from './TopBarActions.js';
import { useShellTests } from './useShellTests.js';
import { applyTabOrder, useTabOrder } from './useTabOrder.js';
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
export function AppLayout({ modules, navModules, failed = [], children }: LayoutProps): React.ReactElement {
  const { pathname } = useLocation();
  const active = activeNavModule(pathname, navModules);
  const tabOrder = useTabOrder();
  const { barOnScroll, menuVariant } = useShellTests();
  // On the document, not on a subtree: the popovers and dialogs of the pages are rendered in portals and must follow the accent too.
  useRootAccent(active ? moduleColor(active.id) : undefined);

  const listed = applyTabOrder(listedNavModules(navModules), tabOrder.saved);
  const tabs: ShellItem[] = [
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

  const menuModule = active ?? homeNavModule(navModules);
  const onDashboard = menuModule.id === HOME_MODULE_ID;
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
      },
    ]),
  };

  const actions = (
    <>
      <NavSettings modules={listed} customized={tabOrder.saved.length > 0} onSave={tabOrder.save} onReset={tabOrder.reset} />
      <TopBarActions modules={modules} failed={failed} />
    </>
  );

  return (
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
      barOnScroll={barOnScroll}
      menuVariant={menuVariant}
      // The name of the drag handle of the `resizable` menu.
      resizeLabel="Resize the side menu"
    >
      <Breadcrumb crumbs={trimmedTrail(breadcrumbFor(pathname, navModules, modules))} />
      {children}
    </AppShell>
  );
}
