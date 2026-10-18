import React, { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { activeNavModule, activeNavPage } from './navModel.js';
import { TopBarActions } from './TopBarActions.js';
import type { LayoutProps } from './types.js';

// `indent` is a full padding class, not appended afterwards: two competing pl-* classes are resolved by Tailwind's stylesheet order, not by their order in the string.
const itemClass = (isActive: boolean, indent: string): string =>
  `block truncate rounded-md py-1.5 pr-2 text-sm transition-colors ${indent} ${
    isActive ? 'bg-bg font-medium text-content' : 'text-muted hover:bg-bg hover:text-content'
  }`;

// Variant B (Linear-like). Everything navigational is on the left: Dashboard, then one collapsible section
// per module holding its pages. The slim top bar only carries the breadcrumb and the shell actions.
export function SidebarTreeLayout({ modules, navModules, failed = [], children }: LayoutProps): React.ReactElement {
  const { pathname } = useLocation();
  const active = activeNavModule(pathname, navModules);
  const activePage = active ? activeNavPage(pathname, active) : undefined;
  // Explicit user choices only; a module without one is open exactly when it is the active module.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const isOpen = (id: string): boolean => overrides[id] ?? active?.id === id;
  const toggle = (id: string): void => setOverrides((o) => ({ ...o, [id]: !isOpen(id) }));

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="flex w-60 shrink-0 flex-col gap-1 border-r border-border bg-surface p-2">
        <Link to="/" className="px-2 py-2 text-base font-semibold text-content">
          app-core
        </Link>
        <nav aria-label="Modules" className="flex flex-col gap-0.5">
          <NavLink to="/" end className={({ isActive }) => itemClass(isActive, 'pl-2')}>
            Dashboard
          </NavLink>
          {navModules.map((m) => {
            const open = isOpen(m.id);
            return (
              <div key={m.id} className="mt-1">
                <button
                  type="button"
                  onClick={() => toggle(m.id)}
                  aria-expanded={open}
                  className={`flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors hover:bg-bg ${
                    active?.id === m.id ? 'text-primary' : 'text-content'
                  }`}
                >
                  {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span className="truncate">{m.title}</span>
                </button>
                {open ? (
                  <div className="flex flex-col gap-0.5">
                    {m.pages.map((p) => (
                      <NavLink key={p.routePath} to={p.routePath} end={p.exact} className={({ isActive }) => itemClass(isActive, 'pl-7')}>
                        {p.label}
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-2">
          <nav aria-label="Breadcrumb" className="truncate text-sm text-muted">
            {active ? (
              <>
                <span>{active.title}</span>
                {activePage ? <span className="text-content"> / {activePage.label}</span> : null}
              </>
            ) : (
              <span className="text-content">Dashboard</span>
            )}
          </nav>
          <TopBarActions modules={modules} failed={failed} />
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
