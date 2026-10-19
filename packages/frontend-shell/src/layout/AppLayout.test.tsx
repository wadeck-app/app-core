import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AppLayout } from './AppLayout.js';
import { moduleColor } from './Logo.js';
import { navModulesFor } from './navModel.js';
import { FIXTURE_MODULES, FIXTURE_NAV } from './testFixtures.js';

const billing = FIXTURE_NAV[0];
const settings = FIXTURE_NAV[4];

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppLayout modules={[]} navModules={FIXTURE_NAV}>
        <p>content</p>
      </AppLayout>
    </MemoryRouter>,
  );

const logosIn = (root: HTMLElement) => Array.from(root.querySelectorAll('[data-initials]')).map((l) => l.getAttribute('data-initials'));
// The accent is applied on <html> as inline custom properties.
const rootAccent = () => document.documentElement.style.getPropertyValue('--color-primary-solid');

afterEach(() => {
  document.documentElement.style.removeProperty('--color-primary-solid');
});

describe('AppLayout: top tabs', () => {
  it('shows one tab per module with its 2-letter logo and name, never the pages', () => {
    renderAt(billing.basePath);
    const tabs = within(screen.getByRole('navigation', { name: 'Modules' }));
    // The logo letters come first in each link's text (the logo is aria-hidden, so it is not part of the accessible name).
    expect(tabs.getAllByRole('link').map((l) => l.textContent)).toEqual(['Dashboard', 'BIBilling', 'INInventory', 'REReports', 'ALAudit log', 'SESettings']);
    expect(logosIn(screen.getByRole('navigation', { name: 'Modules' }))).toEqual(['BI', 'IN', 'RE', 'AL', 'SE']);
  });

  it('marks the tab of the active module on every one of its pages', () => {
    renderAt(`${billing.basePath}/p1`);
    expect(screen.getByRole('link', { name: 'Billing' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('link', { name: 'Inventory' })).not.toHaveAttribute('aria-current');
  });
});

// The look of the bar (height, shadow, theme tokens) belongs to dsl-ui's AppShell and is tested there.
describe('AppLayout: top bar', () => {
  it('shows the app name, the module tabs and the app actions (theme toggle, versions) in the top bar', () => {
    renderAt(billing.basePath);
    const bar = within(screen.getByRole('banner'));
    expect(bar.getByText('app-core')).toBeInTheDocument();
    expect(bar.getByRole('navigation', { name: 'Modules' })).toBeInTheDocument();
    expect(bar.getByRole('button', { name: /Switch to (dark|light) mode/ })).toBeInTheDocument();
    expect(bar.getByRole('button', { name: 'Versions' })).toBeInTheDocument();
  });

  it('offers a keyboard skip link to the content, in English like the rest of the app', () => {
    renderAt(billing.basePath);
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip.getAttribute('href')).toMatch(/^#.+/);
    // It targets the main area.
    expect(screen.getByRole('main').id).toBe(skip.getAttribute('href')!.slice(1));
  });
});

describe('AppLayout: sidebar, always visible', () => {
  it('lists the pages of the active module and marks the current one', () => {
    renderAt(`${billing.basePath}/p1`);
    const side = within(screen.getByRole('navigation', { name: 'Billing pages' }));
    expect(side.getAllByRole('link').map((l) => l.textContent)).toEqual(billing.pages.map((p) => p.label));
    expect(side.getByRole('link', { name: 'Invoices' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Suppliers' })).not.toBeInTheDocument();
  });

  it('is still there for a module with a single page', () => {
    renderAt(settings.basePath);
    expect(within(screen.getByTestId('shell-menu')).getByRole('link', { name: 'General' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('on the dashboard, lists the dashboard and one quick-launch entry per module, each with its logo', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Dashboard pages' });
    expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(['DADashboard', 'BIBilling', 'INInventory', 'REReports', 'ALAudit log', 'SESettings']);
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Billing' })).toHaveAttribute('href', billing.pages[0].routePath);
    expect(logosIn(nav)).toEqual(['DA', 'BI', 'IN', 'RE', 'AL', 'SE']);
  });

  it('has no visible header: the active tab already names the module, which stays a heading for screen readers', () => {
    renderAt(billing.basePath);
    const side = screen.getByTestId('shell-menu');
    // Neither a logo nor a visible title above the pages.
    expect(side.querySelector('[data-initials]')).toBeNull();
    const heading = within(side).getByRole('heading', { name: 'Billing' });
    expect(heading.className).toContain('sr-only');
    // The pages start right at the top of the sidebar.
    expect(side.firstElementChild).toBe(heading);
    expect(side.children[1]).toBe(within(side).getByRole('navigation', { name: 'Billing pages' }));
  });

  it('uses the theme tokens only, so it follows light and dark (no hard-coded dark classes)', () => {
    renderAt(billing.basePath);
    const side = screen.getByTestId('shell-menu');
    const classes = [side, ...within(side).getAllByRole('link')].flatMap((el) => el.className.split(/\s+/));
    expect(classes.filter((c) => c.startsWith('dark:') || /slate-/.test(c))).toEqual([]);
  });
});

// A module whose manifest says showInNav: false: no tab and no dashboard shortcut, but its pages are still served.
describe('AppLayout: a module that is not listed (showInNav: false)', () => {
  const modules = FIXTURE_MODULES.map((m) => (m.id === 'reports' ? { ...m, showInNav: false } : m));
  const navModules = navModulesFor(modules);
  const reports = navModules.find((m) => m.id === 'reports')!;

  const renderHidden = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <AppLayout modules={[]} navModules={navModules}>
          <p>content</p>
        </AppLayout>
      </MemoryRouter>,
    );
  const tabNames = () => within(screen.getByRole('navigation', { name: 'Modules' })).getAllByRole('link').map((l) => l.textContent);

  it('has no tab in the top bar', () => {
    renderHidden('/');
    expect(tabNames()).toEqual(['Dashboard', 'BIBilling', 'INInventory', 'ALAudit log', 'SESettings']);
  });

  it('has no shortcut on the dashboard menu', () => {
    renderHidden('/');
    const labels = within(screen.getByRole('navigation', { name: 'Dashboard pages' })).getAllByRole('link').map((l) => l.textContent);
    expect(labels).toEqual(['DADashboard', 'BIBilling', 'INInventory', 'ALAudit log', 'SESettings']);
  });

  it('still lists its pages in the side menu while one of them is open, with the current one marked', () => {
    renderHidden(`${reports.basePath}/p1`);
    const side = within(screen.getByRole('navigation', { name: 'Reports pages' }));
    expect(side.getAllByRole('link').map((l) => l.textContent)).toEqual(reports.pages.map((p) => p.label));
    expect(side.getByRole('link', { name: 'Scheduled exports' })).toHaveAttribute('aria-current', 'page');
  });

  it('highlights no tab on its pages (it has none), and the other tabs stay plain', () => {
    renderHidden(reports.basePath);
    const links = within(screen.getByRole('navigation', { name: 'Modules' })).getAllByRole('link');
    expect(links.filter((l) => l.getAttribute('aria-current') !== null)).toEqual([]);
  });

  it('keeps the accent of its own color on its pages', () => {
    renderHidden(reports.basePath);
    expect(document.documentElement.style.getPropertyValue('--color-primary-solid')).toBe(moduleColor('reports'));
  });

  it('lists every module again when the option is absent or true', () => {
    renderAt('/');
    expect(within(screen.getByRole('navigation', { name: 'Modules' })).getAllByRole('link')).toHaveLength(FIXTURE_MODULES.length + 1);
  });
});

// What the adapter owns, on top of the generic shell: the module model and the URL.
describe('AppLayout: adapter between the module model and the shell', () => {
  const asBackgroundImage = (css: string): string => {
    const probe = document.createElement('i');
    probe.style.backgroundImage = css;
    return probe.style.backgroundImage;
  };
  const upBlend = (color: string): string => {
    const mixed = (pct: number): string => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
    return `radial-gradient(60% 90% at 50% 100%, ${mixed(32)}, transparent 100%), linear-gradient(0deg, ${mixed(14)}, transparent)`;
  };
  const tab = (name: string) => within(screen.getByRole('navigation', { name: 'Modules' })).getByRole('link', { name });
  const menuLink = (navName: string, name: string) => within(screen.getByRole('navigation', { name: navName })).getByRole('link', { name });

  it('highlights the current module tab with the color of that module', () => {
    renderAt(billing.basePath);
    expect(tab('Billing').style.backgroundImage).toBe(asBackgroundImage(upBlend(moduleColor('billing'))));
    expect(tab('Inventory').style.backgroundImage).toBe('');
  });

  it('gives two modules two different highlights', () => {
    renderAt(billing.basePath);
    const a = tab('Billing').style.backgroundImage;
    document.body.innerHTML = '';
    renderAt(FIXTURE_NAV[1].basePath);
    const b = tab('Inventory').style.backgroundImage;
    expect(b).toBe(asBackgroundImage(upBlend(moduleColor('inventory'))));
    expect(b).not.toBe(a);
  });

  it('highlights the Dashboard tab with the theme accent when it is the current page', () => {
    renderAt('/');
    expect(tab('Dashboard').style.backgroundImage).toBe(asBackgroundImage(upBlend('var(--color-primary-solid)')));
    expect(tab('Dashboard')).toHaveAttribute('aria-current', 'page');
  });

  it('marks a module tab as current ("true") on every page of its module', () => {
    renderAt(`${billing.basePath}/p2`);
    expect(tab('Billing')).toHaveAttribute('aria-current', 'true');
    expect(tab('Inventory')).not.toHaveAttribute('aria-current');
  });

  it('marks as current only the page being viewed: the module home does not stay lit on its other pages', () => {
    renderAt(billing.basePath);
    expect(menuLink('Billing pages', 'Overview')).toHaveAttribute('aria-current', 'page');
    expect(menuLink('Billing pages', 'Invoices')).not.toHaveAttribute('aria-current');
    document.body.innerHTML = '';
    renderAt(`${billing.basePath}/p1`);
    expect(menuLink('Billing pages', 'Invoices')).toHaveAttribute('aria-current', 'page');
    expect(menuLink('Billing pages', 'Overview')).not.toHaveAttribute('aria-current');
  });

  it('links through the router (client-side navigation, no full reload)', () => {
    renderAt(billing.basePath);
    // react-router's Link marks its anchors; a plain <a> would not.
    expect(tab('Inventory')).toHaveAttribute('data-discover', 'true');
    expect(tab('Inventory')).toHaveAttribute('href', FIXTURE_NAV[1].pages[0].routePath);
  });

  it('gives every module tab the same logo size, and the Dashboard tab none', () => {
    renderAt('/');
    const sizes = FIXTURE_NAV.map((m) => tab(m.title).querySelector<HTMLElement>('[data-initials]')!.className.split(/\s+/).filter((c) => /^(h-|min-w-|px-|text-\[)/.test(c)).sort());
    for (const s of sizes) expect(s).toEqual(sizes[0]);
    expect(tab('Dashboard').querySelector('[data-initials]')).toBeNull();
  });
});

describe('AppLayout: module accent', () => {
  it('recolors the accent with the color of the module being viewed', () => {
    renderAt(billing.basePath);
    expect(rootAccent()).toBe(moduleColor('billing'));
  });

  it('keeps the default accent on the dashboard', () => {
    renderAt('/');
    expect(rootAccent()).toBe('');
  });

  it('gives two modules two different accents', () => {
    const first = renderAt(billing.basePath);
    const a = rootAccent();
    first.unmount();
    renderAt(FIXTURE_NAV[1].basePath);
    expect(rootAccent()).toBe(moduleColor(FIXTURE_NAV[1].id));
    expect(rootAccent()).not.toBe(a);
  });

  it('removes the accent when the layout goes away', () => {
    const view = renderAt(billing.basePath);
    expect(rootAccent()).not.toBe('');
    view.unmount();
    expect(rootAccent()).toBe('');
  });
});
