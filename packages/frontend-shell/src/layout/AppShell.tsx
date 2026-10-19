import React from 'react';

// A generic application frame: a top bar (brand, tabs, actions), an always-visible side menu and the content.
// It knows nothing about routing, modules or extension points: it renders plain data, and the host decides what is
// current and how a link navigates (`renderLink`). Without a `renderLink` it renders plain <a href>.

export interface ShellLinkProps {
  href: string;
  className: string;
  style?: React.CSSProperties;
  // 'page' for the current page, 'true' for a current section (a tab); absent when not current.
  'aria-current'?: 'page' | 'true';
  children: React.ReactNode;
}

export interface ShellItem {
  id: string;
  label: string;
  href: string;
  // Drawn before the label (a logo, an icon). Decorative: the label carries the meaning.
  icon?: React.ReactNode;
  // Set by the host on the item that is current. 'page' for a page, 'true' for a section.
  current?: 'page' | 'true';
  // Color of the highlight when the item is current; defaults to the theme accent.
  accent?: string;
}

export interface ShellMenu {
  // Names the side menu: a visually hidden heading, so assistive technology still announces where you are.
  title: string;
  // Accessible name of the menu's navigation.
  label: string;
  items: ShellItem[];
}

export interface AppShellProps {
  brand: React.ReactNode;
  tabs: ShellItem[];
  // Accessible name of the tabs' navigation.
  tabsLabel: string;
  menu: ShellMenu;
  // Right side of the top bar.
  actions?: React.ReactNode;
  renderLink?: (props: ShellLinkProps) => React.ReactElement;
  children: React.ReactNode;
}

const defaultRenderLink = ({ href, children, ...rest }: ShellLinkProps): React.ReactElement => (
  <a href={href} {...rest}>
    {children}
  </a>
);

// The tab is as tall as the top bar (self-stretch), so the current highlight fills it from top to bottom.
const TAB = 'flex items-center gap-1.5 self-stretch whitespace-nowrap px-4 text-sm transition-colors';
const TAB_CURRENT = 'font-semibold text-content';
const TAB_OTHER = 'font-medium text-muted hover:bg-bg hover:text-content';
// Highlight color of a current tab without its own accent: the theme accent.
const THEME_ACCENT = 'var(--color-primary-solid)';

const mix = (color: string, pct: number): string => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

// The current tab: a light vertical fade of the accent from the bottom edge, plus a small glow centered on the bottom
// edge (strongest at the bottom center, softer toward the sides and the top).
const currentTabStyle = (color: string): React.CSSProperties => ({
  backgroundImage: `radial-gradient(60% 90% at 50% 100%, ${mix(color, 32)}, transparent 100%), linear-gradient(0deg, ${mix(color, 14)}, transparent)`,
});

// Follows the theme: the dsl-ui tokens in light mode, the deep slate look in dark mode (`dark:` variants).
const menuItemClass = (current: boolean): string =>
  `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
    current
      ? 'bg-primary-light font-medium text-primary dark:bg-slate-700/70 dark:text-white'
      : 'text-muted hover:bg-bg hover:text-content dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
  }`;

export function AppShell({ brand, tabs, tabsLabel, menu, actions, renderLink = defaultRenderLink, children }: AppShellProps): React.ReactElement {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      {/* 44px, no border: a soft shadow separates it from the page (z-10 keeps the shadow above the content). Fixed
          height, whatever the tab: a tab can fill it from top to bottom. */}
      <header className="relative z-10 flex h-11 items-center gap-6 bg-surface px-4 shadow-sm">
        <span className="text-base font-semibold text-content">{brand}</span>
        {/* As tall as the top bar (self-stretch). Scrolls instead of wrapping when there are more tabs than the bar can hold. */}
        <nav aria-label={tabsLabel} className="flex min-w-0 items-center gap-4 self-stretch overflow-x-auto">
          {tabs.map((tab) => (
            <React.Fragment key={tab.id}>
              {renderLink({
                href: tab.href,
                className: `${TAB} ${tab.current ? TAB_CURRENT : TAB_OTHER}`,
                style: tab.current ? currentTabStyle(tab.accent ?? THEME_ACCENT) : undefined,
                'aria-current': tab.current,
                children: (
                  <>
                    {tab.icon}
                    {tab.label}
                  </>
                ),
              })}
            </React.Fragment>
          ))}
        </nav>
        {actions}
      </header>
      <div className="flex min-h-0 flex-1">
        <aside data-testid="shell-menu" className="flex w-60 shrink-0 flex-col gap-3 border-r border-border bg-surface p-3 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="sr-only">{menu.title}</h2>
          <nav aria-label={menu.label} className="flex flex-col gap-0.5">
            {menu.items.map((item) => (
              <React.Fragment key={item.id}>
                {renderLink({
                  href: item.href,
                  className: menuItemClass(item.current !== undefined),
                  'aria-current': item.current,
                  children: (
                    <>
                      {item.icon}
                      <span className="truncate">{item.label}</span>
                    </>
                  ),
                })}
              </React.Fragment>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
