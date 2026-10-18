import React from 'react';
import { NavLink } from 'react-router-dom';
import { Logo } from './Logo.js';
import type { NavModule } from './navModel.js';

// Follows the theme: the dsl-ui tokens in light mode, the deep slate look in dark mode (`dark:` variants).
const itemClass = (active: boolean): string =>
  `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
    active
      ? 'bg-primary-light font-medium text-primary dark:bg-slate-700/70 dark:text-white'
      : 'text-muted hover:bg-bg hover:text-content dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
  }`;

interface ModuleSidebarProps {
  module: NavModule;
  // Also put a small logo before every entry; meant for the dashboard sidebar, whose entries are modules.
  itemLogos?: boolean;
}

// Second level of the navigation: the pages of one module (always visible, even for a single page).
// It has no visible header: the active top tab already names the module. The name stays a heading for screen readers.
export function ModuleSidebar({ module, itemLogos = false }: ModuleSidebarProps): React.ReactElement {
  return (
    <aside
      data-testid="module-sidebar"
      className="flex w-60 shrink-0 flex-col gap-3 border-r border-border bg-surface p-3 dark:border-slate-800 dark:bg-slate-900"
    >
      <h2 className="sr-only">{module.title}</h2>
      <nav aria-label={`${module.title} pages`} className="flex flex-col gap-0.5">
        {module.pages.map((p) => (
          <NavLink key={p.routePath} to={p.routePath} end={p.exact} className={({ isActive }) => itemClass(isActive)}>
            {itemLogos ? <Logo title={p.label} moduleId={p.moduleId} /> : null}
            <span className="truncate">{p.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
