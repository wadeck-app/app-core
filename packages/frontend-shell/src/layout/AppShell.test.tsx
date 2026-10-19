import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell, type AppShellProps, type ShellItem, type ShellLinkProps } from './AppShell.js';

// No router anywhere in this file: the shell renders plain data and plain links.

const asBackgroundImage = (css: string): string => {
  const probe = document.createElement('i');
  probe.style.backgroundImage = css;
  return probe.style.backgroundImage;
};
const mixed = (color: string, pct: number): string => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
const upBlend = (color: string): string =>
  `radial-gradient(60% 90% at 50% 100%, ${mixed(color, 32)}, transparent 100%), linear-gradient(0deg, ${mixed(color, 14)}, transparent)`;

const TABS: ShellItem[] = [
  { id: 'home', label: 'Home', href: '/', icon: <i data-testid="icon-home" />, current: 'page' },
  { id: 'a', label: 'Alpha', href: '/a', icon: <i data-testid="icon-a" />, accent: '#e11d48' },
  { id: 'b', label: 'Beta', href: '/b', icon: <i data-testid="icon-b" />, accent: '#0284c7' },
];
const MENU = {
  title: 'Home',
  label: 'Home pages',
  items: [
    { id: 'overview', label: 'Overview', href: '/', current: 'page' as const },
    { id: 'reports', label: 'Reports', href: '/reports', icon: <i data-testid="icon-reports" /> },
  ],
};

const shell = (props: Partial<AppShellProps> = {}) =>
  render(
    <AppShell brand="my-app" tabs={TABS} tabsLabel="Sections" menu={MENU} actions={<button type="button">Actions</button>} {...props}>
      <p>page content</p>
    </AppShell>,
  );

describe('AppShell without any router', () => {
  it('renders plain links with the given hrefs', () => {
    shell();
    const tabs = within(screen.getByRole('navigation', { name: 'Sections' }));
    expect(tabs.getAllByRole('link').map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Home', '/'],
      ['Alpha', '/a'],
      ['Beta', '/b'],
    ]);
    const menu = within(screen.getByRole('navigation', { name: 'Home pages' }));
    expect(menu.getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/', '/reports']);
  });

  it('puts the brand and the actions in the top bar and the children in the main area', () => {
    shell();
    const bar = within(screen.getByRole('banner'));
    expect(bar.getByText('my-app')).toBeInTheDocument();
    expect(bar.getByRole('button', { name: 'Actions' })).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByText('page content')).toBeInTheDocument();
  });

  it('works without actions', () => {
    shell({ actions: undefined });
    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
  });
});

describe('AppShell top bar', () => {
  it('is 44px, borderless, and separated from the page by a soft shadow', () => {
    shell();
    const classes = screen.getByRole('banner').className.split(/\s+/);
    for (const c of ['h-11', 'shadow-sm', 'bg-surface', 'z-10']) expect(classes).toContain(c);
    expect(classes).not.toContain('border-b');
  });

  it('shows each tab icon before its label', () => {
    shell();
    const alpha = screen.getByRole('link', { name: 'Alpha' });
    expect(within(alpha).getByTestId('icon-a')).toBeInTheDocument();
    expect(alpha.firstElementChild).toBe(within(alpha).getByTestId('icon-a'));
  });
});

describe('AppShell tabs: the current one is highlighted', () => {
  it('marks the current tab with the aria-current the host chose, and only that one', () => {
    shell({ tabs: [{ ...TABS[0], current: undefined }, { ...TABS[1], current: 'true' }, TABS[2]] });
    const tabs = within(screen.getByRole('navigation', { name: 'Sections' }));
    expect(tabs.getByRole('link', { name: 'Alpha' })).toHaveAttribute('aria-current', 'true');
    expect(tabs.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
    expect(tabs.getByRole('link', { name: 'Beta' })).not.toHaveAttribute('aria-current');
  });

  it('paints the current tab with Up blend in its own accent', () => {
    shell({ tabs: [{ ...TABS[1], current: 'true' }] });
    expect(screen.getByRole('link', { name: 'Alpha' }).style.backgroundImage).toBe(asBackgroundImage(upBlend('#e11d48')));
  });

  it('falls back to the theme accent for a current tab without an accent', () => {
    shell();
    expect(screen.getByRole('link', { name: 'Home' }).style.backgroundImage).toBe(asBackgroundImage(upBlend('var(--color-primary-solid)')));
  });

  it('leaves the other tabs plain', () => {
    shell();
    for (const name of ['Alpha', 'Beta']) {
      const tab = screen.getByRole('link', { name });
      expect(tab.style.backgroundImage, name).toBe('');
      expect(tab.className, name).toContain('text-muted');
      expect(tab.className, name).toContain('font-medium');
    }
  });

  it('gives the current tab a bolder, darker label', () => {
    shell();
    const current = screen.getByRole('link', { name: 'Home' });
    expect(current.className).toContain('font-semibold');
    expect(current.className).toContain('text-content');
  });

  it('makes every tab as tall as the top bar, so the highlight fills it', () => {
    shell();
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(nav.className).toContain('self-stretch');
    for (const tab of within(nav).getAllByRole('link')) {
      expect(tab.className).toContain('self-stretch');
      expect(tab.className).not.toMatch(/\bpy-/);
    }
  });

  it('keeps the same tab shape current or not', () => {
    shell();
    const shape = (el: HTMLElement) => el.className.split(/\s+/).filter((c) => /^(self-stretch|px-|gap-|flex|items-)/.test(c)).sort();
    expect(shape(screen.getByRole('link', { name: 'Home' }))).toEqual(shape(screen.getByRole('link', { name: 'Alpha' })));
  });
});

describe('AppShell side menu', () => {
  const menu = () => screen.getByTestId('shell-menu');

  it('has no visible header: the title is a hidden heading and the entries start at the top', () => {
    shell();
    const heading = within(menu()).getByRole('heading', { name: 'Home' });
    expect(heading.className).toContain('sr-only');
    expect(menu().firstElementChild).toBe(heading);
    expect(menu().children[1]).toBe(screen.getByRole('navigation', { name: 'Home pages' }));
  });

  it('marks the current entry', () => {
    shell();
    const m = within(menu());
    expect(m.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    expect(m.getByRole('link', { name: 'Reports' })).not.toHaveAttribute('aria-current');
  });

  it('shows an entry icon only where the host gave one', () => {
    shell();
    expect(within(screen.getByRole('link', { name: 'Reports' })).getByTestId('icon-reports')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Overview' }).querySelector('i')).toBeNull();
  });

  it('follows the theme: dsl-ui surface in light mode, deep slate only through dark: variants', () => {
    shell();
    const classes = menu().className.split(/\s+/);
    expect(classes).toContain('bg-surface');
    expect(classes).toContain('dark:bg-slate-900');
    expect(classes).not.toContain('bg-slate-900');
    expect(classes).not.toContain('border-slate-800');
    for (const link of within(menu()).getAllByRole('link')) {
      const c = link.className.split(/\s+/);
      expect(c, link.textContent ?? '').not.toContain('text-white');
      expect(c, link.textContent ?? '').not.toContain('text-slate-400');
    }
  });

  it('highlights the current entry with the accent in light mode and slate in dark mode', () => {
    shell();
    const current = screen.getByRole('link', { name: 'Overview' }).className.split(/\s+/);
    expect(current).toContain('bg-primary-light');
    expect(current).toContain('text-primary');
    expect(current).toContain('dark:bg-slate-700/70');
  });
});

describe('AppShell renderLink slot', () => {
  it('lets the host render every link (routers) and receives the same props the default link would', () => {
    const seen: ShellLinkProps[] = [];
    shell({
      renderLink: (props) => {
        seen.push(props);
        const { href, children, ...rest } = props;
        return (
          <a data-custom="yes" href={`#${href}`} {...rest}>
            {children}
          </a>
        );
      },
    });
    // Every tab and every menu entry went through the slot.
    expect(seen).toHaveLength(TABS.length + MENU.items.length);
    expect(document.querySelectorAll('a[data-custom="yes"]')).toHaveLength(seen.length);
    expect(screen.getByRole('link', { name: 'Alpha' })).toHaveAttribute('href', '#/a');
    // The host gets what it needs to render the link correctly.
    const home = seen.find((p) => p.href === '/' && p['aria-current'] === 'page' && p.className.includes('self-stretch'))!;
    expect(home.className).toContain('font-semibold');
    expect(home.style?.backgroundImage).toContain('radial-gradient');
    const reports = seen.find((p) => p.href === '/reports')!;
    expect(reports['aria-current']).toBeUndefined();
  });

  it('calls the slot once per item and render', () => {
    const renderLink = vi.fn((props: ShellLinkProps) => <a href={props.href}>{props.children}</a>);
    shell({ renderLink });
    expect(renderLink).toHaveBeenCalledTimes(TABS.length + MENU.items.length);
  });
});
