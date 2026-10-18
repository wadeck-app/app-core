import React from 'react';
import { useLocation } from 'react-router-dom';
import { moduleColor } from './Logo.js';
import { ModuleSidebar } from './ModuleSidebar.js';
import { ModuleTabs } from './ModuleTabs.js';
import { useModuleAccent } from './moduleAccent.js';
import { HOME_MODULE_ID, activeNavModule, homeNavModule } from './navModel.js';
import { TopBarActions } from './TopBarActions.js';
import type { LayoutProps } from './types.js';

// The app layout. Top bar = brand + one tab per module (colored 2-letter logo and name); left = the pages of the active
// module in an always-visible dark sidebar, or the quick-launch list of modules on the dashboard.
// The accent color (dsl-ui's --color-primary*) follows the module being viewed; the dashboard keeps the default.
export function AppLayout({ modules, navModules, failed = [], tabHighlight, children }: LayoutProps): React.ReactElement {
  const { pathname } = useLocation();
  const active = activeNavModule(pathname, navModules);
  useModuleAccent(active ? moduleColor(active.id) : undefined);
  const sidebarModule = active ?? homeNavModule(navModules);
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      {/* 44px, no border: a soft shadow separates it from the page (z-10 keeps the shadow above the content). Fixed
          height, whatever the tab style: a tab can fill it from top to bottom. */}
      <header className="relative z-10 flex h-11 items-center gap-6 bg-surface px-4 shadow-sm">
        <span className="text-base font-semibold text-content">app-core</span>
        <ModuleTabs navModules={navModules} highlight={tabHighlight} />
        <TopBarActions modules={modules} failed={failed} />
      </header>
      <div className="flex min-h-0 flex-1">
        <ModuleSidebar module={sidebarModule} itemLogos={sidebarModule.id === HOME_MODULE_ID} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
