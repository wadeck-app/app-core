import React from 'react';
import { useLocation } from 'react-router-dom';
import type { LogoMode } from './Logo.js';
import { ModuleSidebar, type SidebarLook } from './ModuleSidebar.js';
import { ModuleTabs } from './ModuleTabs.js';
import { HOME_MODULE_ID, activeNavModule, homeNavModule } from './navModel.js';
import { TopBarActions } from './TopBarActions.js';
import type { LayoutProps } from './types.js';
import { usePersistentFlag } from './usePersistentFlag.js';

export const SIDEBAR_COLLAPSED_KEY = 'shell.sidebar.collapsed';

interface TopTabsLayoutProps extends LayoutProps {
  // Variant C: a toggle shrinks the sidebar to an icon rail, remembered across reloads.
  collapsible?: boolean;
  // 'auto' (A, C): no sidebar for a module with a single page nor on the dashboard.
  // 'always' (D*): the sidebar is always there; on the dashboard it lists the modules.
  sidebar?: 'auto' | 'always';
  look?: SidebarLook;
  // Logo letters/color in the sidebar header. 'duo-colored' also puts the logos in the top tabs and before each dashboard shortcut.
  logo?: LogoMode;
}

// Variants A, C and D*. Top bar = brand + one tab per module; left = the pages of the active module.
export function TopTabsLayout({ modules, navModules, failed = [], tabHighlight, collapsible = false, sidebar = 'auto', look, logo, children }: TopTabsLayoutProps): React.ReactElement {
  const { pathname } = useLocation();
  const [collapsed, toggleCollapsed] = usePersistentFlag(SIDEBAR_COLLAPSED_KEY);
  const active = activeNavModule(pathname, navModules);
  const sidebarModule = sidebar === 'always' ? (active ?? homeNavModule(navModules)) : active !== undefined && active.pages.length > 1 ? active : undefined;
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="flex items-center gap-6 border-b border-border bg-surface px-4 py-3">
        <span className="text-base font-semibold text-content">app-core</span>
        <ModuleTabs navModules={navModules} logos={logo === 'duo-colored'} highlight={tabHighlight} />
        <TopBarActions modules={modules} failed={failed} />
      </header>
      <div className="flex min-h-0 flex-1">
        {sidebarModule ? (
          <ModuleSidebar
            module={sidebarModule}
            look={look}
            logo={logo}
            itemLogos={logo === 'duo-colored' && sidebarModule.id === HOME_MODULE_ID}
            collapsed={collapsible && collapsed}
            onToggleCollapsed={collapsible ? toggleCollapsed : undefined}
          />
        ) : null}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
