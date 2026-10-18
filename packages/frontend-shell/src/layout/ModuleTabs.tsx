import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Logo } from './Logo.js';
import { activeNavModule, type NavModule } from './navModel.js';

const tabClass = (active: boolean): string =>
  `whitespace-nowrap text-sm font-medium transition-colors ${active ? 'text-primary' : 'text-muted hover:text-content'}`;

// Top level of the navigation: one entry per module, only its name. Pages live in the ModuleSidebar.
// A tab stays highlighted on every page of its module and points to the module's first page.
// `logos` puts the module's colored 2-letter logo before its name.
export function ModuleTabs({ navModules, logos = false }: { navModules: NavModule[]; logos?: boolean }): React.ReactElement {
  const { pathname } = useLocation();
  const active = activeNavModule(pathname, navModules);
  return (
    // Scrolls instead of wrapping when there are more modules than the bar can hold.
    <nav aria-label="Modules" className="flex min-w-0 items-center gap-5 overflow-x-auto">
      <Link to="/" className={tabClass(pathname === '/')} aria-current={pathname === '/' ? 'page' : undefined}>
        Dashboard
      </Link>
      {navModules.map((m) => (
        <Link
          key={m.id}
          to={m.pages[0].routePath}
          className={`${tabClass(active?.id === m.id)} ${logos ? 'flex items-center gap-1.5' : ''}`}
          aria-current={active?.id === m.id ? 'true' : undefined}
        >
          {logos ? <Logo size="sm" title={m.title} moduleId={m.id} mode="duo-colored" baseColor="" /> : null}
          {m.title}
        </Link>
      ))}
    </nav>
  );
}
