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
export function AppLayout({ modules, navModules, failed = [], tabHighlight, sidebarHeader, children }: LayoutProps): React.ReactElement {
  const { pathname } = useLocation();
  const active = activeNavModule(pathname, navModules);
  useModuleAccent(active ? moduleColor(active.id) : undefined);
  const sidebarModule = active ?? homeNavModule(navModules);
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      {/* Fixed height (60px + border): a tab can fill it from top to bottom, and no style changes the bar's size. */}
      <header className="flex h-[61px] items-center gap-6 border-b border-border bg-surface px-4">
        <span className="text-base font-semibold text-content">app-core</span>
        <ModuleTabs navModules={navModules} highlight={tabHighlight} />
        <TopBarActions modules={modules} failed={failed} />
      </header>
      <div className="flex min-h-0 flex-1">
        <ModuleSidebar module={sidebarModule} itemLogos={sidebarModule.id === HOME_MODULE_ID} header={sidebarHeader} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
