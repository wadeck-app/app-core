import React from 'react';
import { useLocation } from 'react-router-dom';
import { moduleColor } from './Logo.js';
import { ModuleSidebar } from './ModuleSidebar.js';
import { ModuleTabs } from './ModuleTabs.js';
import { useModuleAccent } from './moduleAccent.js';
import { HOME_MODULE_ID, activeNavModule, homeNavModule } from './navModel.js';
import { TOP_BAR_CLASS } from './topBar.js';
import { TopBarActions } from './TopBarActions.js';
import type { LayoutProps } from './types.js';

// The app layout. Top bar = brand + one tab per module (colored 2-letter logo and name); left = the pages of the active
// module in an always-visible dark sidebar, or the quick-launch list of modules on the dashboard.
// The accent color (dsl-ui's --color-primary*) follows the module being viewed; the dashboard keeps the default.
export function AppLayout({ modules, navModules, failed = [], tabHighlight, topBar = 'current', children }: LayoutProps): React.ReactElement {
  const { pathname } = useLocation();
  const active = activeNavModule(pathname, navModules);
  useModuleAccent(active ? moduleColor(active.id) : undefined);
  const sidebarModule = active ?? homeNavModule(navModules);
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      {/* Fixed height, whatever the tab style: a tab can fill it from top to bottom. The height itself is A/B tested. */}
      <header className={`flex items-center gap-6 px-4 ${TOP_BAR_CLASS[topBar].header}`}>
        <span className={`font-semibold text-content ${TOP_BAR_CLASS[topBar].brand}`}>app-core</span>
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
