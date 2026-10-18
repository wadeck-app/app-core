import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Logo, moduleColor } from './Logo.js';
import { activeNavModule, type NavModule } from './navModel.js';

// The tab is as tall as the top bar (self-stretch), so the active highlight fills it from top to bottom.
const TAB = 'flex items-center gap-1.5 self-stretch whitespace-nowrap px-4 text-sm transition-colors';
const ACTIVE = 'font-semibold text-content';
const INACTIVE = 'font-medium text-muted hover:bg-bg hover:text-content';
// Color of the Dashboard tab, which has no module: the app accent (default blue, since no module is active).
const DASHBOARD_COLOR = 'var(--color-primary-solid)';

const mix = (color: string, pct: number): string => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

// The active tab: a light vertical fade of the module color from the bottom edge, plus a small glow centered on the
// bottom edge (strongest at the bottom center, softer toward the sides and the top).
const activeStyle = (color: string): React.CSSProperties => ({
  backgroundImage: `radial-gradient(60% 90% at 50% 100%, ${mix(color, 32)}, transparent 100%), linear-gradient(0deg, ${mix(color, 14)}, transparent)`,
});

// Top level of the navigation: one entry per module, with its colored 2-letter logo and name. Pages live in the
// ModuleSidebar. A tab stays highlighted on every page of its module and points to the module's first page.
export function ModuleTabs({ navModules }: { navModules: NavModule[] }): React.ReactElement {
  const { pathname } = useLocation();
  const active = activeNavModule(pathname, navModules);
  const onDashboard = pathname === '/';
  return (
    // As tall as the top bar (self-stretch). Scrolls instead of wrapping when there are more modules than the bar can hold.
    <nav aria-label="Modules" className="flex min-w-0 items-center gap-4 self-stretch overflow-x-auto">
      <Link
        to="/"
        className={`${TAB} ${onDashboard ? ACTIVE : INACTIVE}`}
        style={onDashboard ? activeStyle(DASHBOARD_COLOR) : undefined}
        aria-current={onDashboard ? 'page' : undefined}
      >
        Dashboard
      </Link>
      {navModules.map((m) => {
        const isActive = active?.id === m.id;
        return (
          <Link
            key={m.id}
            to={m.pages[0].routePath}
            className={`${TAB} ${isActive ? ACTIVE : INACTIVE}`}
            style={isActive ? activeStyle(moduleColor(m.id)) : undefined}
            aria-current={isActive ? 'true' : undefined}
          >
            <Logo title={m.title} moduleId={m.id} />
            {m.title}
          </Link>
        );
      })}
    </nav>
  );
}
