import type { ReactNode } from 'react';
import type { FailedModuleSummary, LoadedModuleSummary } from '../types.js';
import type { NavModule } from './navModel.js';

export interface LayoutProps {
  // Full module list: the top bar still renders their navbar widgets and the versions menu.
  modules: LoadedModuleSummary[];
  navModules: NavModule[];
  failed?: FailedModuleSummary[];
  // An application made of one module: no dashboard tab, no module tabs, the menu is that module's.
  standalone?: { moduleId: string };
  children: ReactNode;
}
