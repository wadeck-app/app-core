import React from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Logo, type LogoMode } from './Logo.js';
import type { NavModule } from './navModel.js';

export type SidebarLook = 'plain' | 'accent' | 'pills' | 'dark';

interface LookClasses {
  aside: string;
  title: string;
  nav: string;
  item: (active: boolean) => string;
  // Module avatar (initial in a colored square) before the title; absent = title only.
  avatar?: string;
  toggle: string;
}

const ITEM_BASE = 'flex items-center gap-2 transition-colors';

// Style presets of the module sidebar. The structure is identical; only the classes differ.
const LOOKS: Record<SidebarLook, LookClasses> = {
  plain: {
    aside: 'flex shrink-0 flex-col gap-1 border-r border-border bg-surface p-2',
    title: 'truncate px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted',
    nav: 'flex flex-col gap-0.5',
    item: (a) => `${ITEM_BASE} rounded-md px-2 py-1.5 text-sm ${a ? 'bg-bg font-medium text-content' : 'text-muted hover:bg-bg hover:text-content'}`,
    toggle: 'text-muted hover:bg-bg hover:text-content',
  },
  // Dense, Linear-like: small text, a thin accent bar on the active entry.
  accent: {
    aside: 'flex shrink-0 flex-col border-r border-border bg-surface py-3',
    title: 'truncate px-3 pb-2 text-[11px] font-semibold uppercase tracking-widest text-muted',
    nav: 'flex flex-col',
    item: (a) =>
      `${ITEM_BASE} border-l-2 px-3 py-1 text-[13px] ${a ? 'border-primary bg-bg font-medium text-content' : 'border-transparent text-muted hover:bg-bg hover:text-content'}`,
    toggle: 'mx-2 text-muted hover:bg-bg hover:text-content',
  },
  // Roomy: module avatar in the header, active entry filled with the primary color.
  pills: {
    aside: 'flex shrink-0 flex-col gap-3 border-r border-border bg-surface p-3',
    title: 'truncate text-sm font-semibold text-content',
    nav: 'flex flex-col gap-1',
    item: (a) => `${ITEM_BASE} rounded-full px-3 py-2 text-sm ${a ? 'bg-primary-solid font-medium text-white shadow-sm' : 'text-muted hover:bg-bg hover:text-content'}`,
    avatar: 'bg-primary-solid text-white',
    toggle: 'text-muted hover:bg-bg hover:text-content',
  },
  // Always dark, whatever the theme, to contrast with the content area (Jira / Datadog-like).
  dark: {
    aside: 'flex shrink-0 flex-col gap-3 border-r border-slate-800 bg-slate-900 p-3',
    title: 'truncate text-sm font-semibold text-white',
    nav: 'flex flex-col gap-0.5',
    item: (a) => `${ITEM_BASE} rounded-md px-3 py-2 text-sm ${a ? 'bg-slate-700/70 font-medium text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`,
    avatar: 'bg-indigo-500 text-white',
    toggle: 'text-slate-400 hover:bg-slate-800 hover:text-white',
  },
};

const WIDTH: Record<SidebarLook, string> = { plain: 'w-56', accent: 'w-52', pills: 'w-60', dark: 'w-60' };

export const initialOf = (label: string): string => label.trim().charAt(0).toUpperCase();

interface ModuleSidebarProps {
  module: NavModule;
  look?: SidebarLook;
  // Letters and color of the module logo (looks with an avatar only).
  logo?: LogoMode;
  // Also put a small logo before every entry; meant for the dashboard sidebar, whose entries are modules.
  itemLogos?: boolean;
  // Collapsed = icon rail showing the initial of each page. Omit `onToggleCollapsed` for a sidebar that cannot collapse.
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

// Second level of the navigation: the pages of one module.
export function ModuleSidebar({ module, look = 'plain', logo = 'initial', itemLogos = false, collapsed = false, onToggleCollapsed }: ModuleSidebarProps): React.ReactElement {
  const c = LOOKS[look];
  return (
    <aside data-testid="module-sidebar" data-look={look} data-collapsed={collapsed} className={`${c.aside} ${collapsed ? 'w-12' : WIDTH[look]}`}>
      {collapsed ? null : (
        <div className={c.avatar ? 'flex items-center gap-2 px-1 pt-1' : ''}>
          {c.avatar ? <Logo title={module.title} moduleId={module.id} mode={logo} baseColor={c.avatar} /> : null}
          <h2 className={c.title}>{module.title}</h2>
        </div>
      )}
      <nav aria-label={`${module.title} pages`} className={c.nav}>
        {module.pages.map((p) => (
          <NavLink
            key={p.routePath}
            to={p.routePath}
            end={p.exact}
            title={collapsed ? p.label : undefined}
            aria-label={collapsed ? p.label : undefined}
            className={({ isActive }) => `${c.item(isActive)} ${collapsed ? 'justify-center' : ''}`}
          >
            {collapsed ? <span aria-hidden="true">{initialOf(p.label)}</span> : null}
            {!collapsed && itemLogos ? <Logo size="sm" title={p.label} moduleId={p.moduleId} mode={logo} baseColor={c.avatar ?? 'bg-slate-500'} /> : null}
            {collapsed ? null : <span className="truncate">{p.label}</span>}
          </NavLink>
        ))}
      </nav>
      {onToggleCollapsed ? (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`mt-auto flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${c.toggle} ${collapsed ? 'justify-center' : ''}`}
        >
          {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
          {collapsed ? null : <span>Collapse</span>}
        </button>
      ) : null}
    </aside>
  );
}
