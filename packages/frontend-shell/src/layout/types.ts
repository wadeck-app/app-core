import type { ReactNode } from 'react';
import type { FailedModuleSummary, LoadedModuleSummary } from '../types.js';
import type { NavModule } from './navModel.js';
import type { SidebarHeader } from './sidebarHeader.js';
import type { TabHighlight } from './tabHighlight.js';

export interface LayoutProps {
  // Full module list: the top bar still renders their navbar widgets and the versions menu.
  modules: LoadedModuleSummary[];
  navModules: NavModule[];
  failed?: FailedModuleSummary[];
  // How the active top tab stands out (A/B tested); layouts without top tabs ignore it.
  tabHighlight?: TabHighlight;
  // What the top of the sidebar shows (A/B tested).
  sidebarHeader?: SidebarHeader;
  children: ReactNode;
}
