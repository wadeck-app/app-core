import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AppLayout } from './AppLayout.js';
import { moduleColor } from './Logo.js';
import { FIXTURE_NAV } from './testFixtures.js';

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

const logosIn = (root: HTMLElement) => Array.from(root.querySelectorAll('[data-logo]')).map((l) => l.getAttribute('data-logo'));
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

describe('AppLayout: top bar', () => {
  it('is the Compact flat bar: 44px, no border, separated from the page by a soft shadow', () => {
    renderAt(billing.basePath);
    const classes = screen.getByRole('banner').className.split(/\s+/);
    expect(classes).toContain('h-11');
    expect(classes).toContain('shadow-sm');
    expect(classes).toContain('bg-surface');
    // No bottom border; z-10 keeps the shadow above the content below.
    expect(classes).not.toContain('border-b');
    expect(classes).toContain('z-10');
  });

  it('keeps the same app name size and puts the tabs and the actions in it', () => {
    renderAt(billing.basePath);
    const bar = within(screen.getByRole('banner'));
    expect(bar.getByText('app-core').className).toContain('text-base');
    expect(bar.getByRole('navigation', { name: 'Modules' })).toBeInTheDocument();
    expect(bar.getByRole('button', { name: /Switch to (dark|light) mode/ })).toBeInTheDocument();
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
    expect(side.querySelector('[data-logo]')).toBeNull();
    const heading = within(side).getByRole('heading', { name: 'Billing' });
    expect(heading.className).toContain('sr-only');
    // The pages start right at the top of the sidebar.
    expect(side.firstElementChild).toBe(heading);
    expect(side.children[1]).toBe(within(side).getByRole('navigation', { name: 'Billing pages' }));
  });

  it('follows the theme: dsl-ui surface in light mode, deep slate only through dark: variants', () => {
    renderAt(billing.basePath);
    const side = screen.getByTestId('shell-menu');
    const classes = side.className.split(/\s+/);
    expect(classes).toContain('bg-surface');
    expect(classes).toContain('dark:bg-slate-900');
    // A bare dark class would keep the sidebar dark in light mode.
    expect(classes).not.toContain('bg-slate-900');
    expect(classes).not.toContain('border-slate-800');
    // Same for the entries: no unconditional light-on-dark text.
    const links = within(side).getAllByRole('link');
    for (const link of links) {
      const c = link.className.split(/\s+/);
      expect(c, link.textContent ?? '').not.toContain('text-white');
      expect(c, link.textContent ?? '').not.toContain('text-slate-400');
    }
    expect(within(side).getByRole('heading', { name: 'Billing' }).className.split(/\s+/)).not.toContain('text-white');
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
    const sizes = FIXTURE_NAV.map((m) => tab(m.title).querySelector<HTMLElement>('[data-logo]')!.className.split(/\s+/).filter((c) => /^(h-|min-w-|px-|text-\[)/.test(c)).sort());
    for (const s of sizes) expect(s).toEqual(sizes[0]);
    expect(tab('Dashboard').querySelector('[data-logo]')).toBeNull();
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
