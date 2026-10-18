import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Logo, type LogoTone } from './Logo.js';
import { activeNavModule, type NavModule } from './navModel.js';
import type { TabHighlight } from './tabHighlight.js';

const BASE = 'flex items-center whitespace-nowrap text-sm font-medium transition-colors';
const INACTIVE_TEXT = 'text-muted hover:text-content';

// Classes of one tab for each way of emphasizing the active module. Only the tab differs; the logo is handled in `logoStyle`.
// The gap lives here, not in BASE: two competing gap-* classes are resolved by Tailwind's stylesheet order, not by their order in the string.
const TAB_CLASS: Record<TabHighlight, (active: boolean) => string> = {
  current: (a) => `gap-1.5 ${a ? 'text-primary' : INACTIVE_TEXT}`,
  pill: (a) => `gap-1.5 rounded-full px-3 py-1 ${a ? 'bg-primary-light font-semibold text-primary' : `${INACTIVE_TEXT} hover:bg-bg`}`,
  solid: (a) => `gap-1.5 rounded-full px-3 py-1 ${a ? 'bg-primary-solid font-semibold text-white shadow-sm' : `${INACTIVE_TEXT} hover:bg-bg`}`,
  underline: (a) => `gap-1.5 border-b-2 pb-0.5 ${a ? 'border-primary-solid font-semibold text-content' : `border-transparent ${INACTIVE_TEXT}`}`,
  // Wider gap: the ring (2px + 2px offset) must not touch the name.
  ring: (a) => `gap-3 ${a ? 'font-semibold text-content' : INACTIVE_TEXT}`,
  invert: (a) => `gap-2 ${a ? 'font-semibold text-content' : INACTIVE_TEXT}`,
  outline: (a) => `gap-2 ${a ? 'font-semibold text-content' : INACTIVE_TEXT}`,
  // Wider gap: the glow reaches 4px around the logo.
  glow: (a) => `gap-3 ${a ? 'font-semibold text-content' : INACTIVE_TEXT}`,
  expand: (a) => `rounded-full p-1 ${a ? 'gap-2 bg-bg pr-3 font-semibold text-content' : 'hover:bg-bg'}`,
  lift: (a) => `gap-1.5 rounded-lg px-3 py-1 ${a ? 'bg-bg font-semibold text-content shadow-sm ring-1 ring-primary-solid' : `${INACTIVE_TEXT} hover:bg-bg`}`,
};

interface TabLogo {
  size: 'sm' | 'lg';
  tone: LogoTone;
  ring?: boolean;
  glow?: boolean;
}

function logoStyle(highlight: TabHighlight, active: boolean): TabLogo {
  const size = active ? 'lg' : 'sm';
  switch (highlight) {
    case 'current':
      return { size: 'sm', tone: 'solid' };
    case 'pill':
    case 'solid':
      return { size, tone: active ? (highlight === 'solid' ? 'inverted' : 'solid') : 'muted' };
    case 'underline':
      return { size: 'sm', tone: active ? 'solid' : 'muted' };
    case 'ring':
      return { size, tone: active ? 'solid' : 'muted', ring: active };
    case 'invert':
      return { size, tone: active ? 'swapped' : 'solid' };
    case 'outline':
      return { size, tone: active ? 'solid' : 'outline' };
    case 'glow':
      return { size, tone: 'solid', glow: active };
    case 'expand':
    case 'lift':
      return { size, tone: 'solid' };
  }
}

const dashboardClass = (highlight: TabHighlight, active: boolean): string => `${BASE} ${TAB_CLASS[highlight](active)}`;

// Top level of the navigation: one entry per module, only its name. Pages live in the ModuleSidebar.
// A tab stays highlighted on every page of its module and points to the module's first page.
// `logos` puts the module's colored 2-letter logo before its name; `highlight` picks how the active tab stands out.
export function ModuleTabs({ navModules, logos = false, highlight = 'current' }: { navModules: NavModule[]; logos?: boolean; highlight?: TabHighlight }): React.ReactElement {
  const { pathname } = useLocation();
  const active = activeNavModule(pathname, navModules);
  return (
    // Fixed height: the bar must not change size (and shift the page) when the highlight style changes.
    // Scrolls instead of wrapping when there are more modules than the bar can hold.
    <nav aria-label="Modules" className="flex h-9 min-w-0 items-center gap-4 overflow-x-auto">
      {/* 'expand' folds inactive tabs to their icon: without logos there is no icon, so the Dashboard keeps a plain tab. */}
      <Link to="/" className={dashboardClass(highlight === 'expand' ? 'current' : highlight, pathname === '/')} aria-current={pathname === '/' ? 'page' : undefined}>
        Dashboard
      </Link>
      {navModules.map((m) => {
        const isActive = active?.id === m.id;
        const l = logoStyle(highlight, isActive);
        const iconOnly = highlight === 'expand' && logos && !isActive;
        return (
          <Link
            key={m.id}
            to={m.pages[0].routePath}
            title={iconOnly ? m.title : undefined}
            className={`${BASE} ${TAB_CLASS[highlight === 'expand' && !logos ? 'current' : highlight](isActive)}`}
            aria-current={isActive ? 'true' : undefined}
          >
            {logos ? <Logo size={l.size} tone={l.tone} ring={l.ring} glow={l.glow} title={m.title} moduleId={m.id} mode="duo-colored" baseColor="" /> : null}
            <span className={iconOnly ? 'sr-only' : ''}>{m.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}
