import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AppLayout } from './AppLayout.js';
import type { SidebarHeader } from './sidebarHeader.js';
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
const accentStyles = () => Array.from(document.head.querySelectorAll('[data-module-accent]'));

afterEach(() => {
  document.head.querySelectorAll('[data-module-accent]').forEach((n) => n.remove());
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
    expect(within(screen.getByTestId('module-sidebar')).getByRole('link', { name: 'General' })).toHaveAttribute('aria-current', 'page');
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

  it('shows the module logo in the sidebar header, in the same color as its tab', () => {
    renderAt(billing.basePath);
    const tab = within(screen.getByRole('navigation', { name: 'Modules' })).getByRole('link', { name: 'Billing' }).querySelector<HTMLElement>('[data-logo]')!;
    const header = screen.getByTestId('module-sidebar').querySelector<HTMLElement>('[data-logo]')!;
    expect(header.getAttribute('data-logo')).toBe('BI');
    expect(header.style.backgroundColor).not.toBe('');
    expect(header.style.backgroundColor).toBe(tab.style.backgroundColor);
  });

  it('follows the theme: dsl-ui surface in light mode, deep slate only through dark: variants', () => {
    renderAt(billing.basePath);
    const side = screen.getByTestId('module-sidebar');
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

describe('AppLayout: sidebar header modes', () => {
  const renderWith = (header: SidebarHeader) =>
    render(
      <MemoryRouter initialEntries={[billing.basePath]}>
        <AppLayout modules={[]} navModules={FIXTURE_NAV} sidebarHeader={header}>
          <p>content</p>
        </AppLayout>
      </MemoryRouter>,
    );
  const side = () => screen.getByTestId('module-sidebar');
  const heading = () => within(side()).getByRole('heading', { name: 'Billing' });

  it('icon-name (reference): the logo and the visible name', () => {
    renderWith('icon-name');
    expect(side().querySelector('[data-logo]')).toHaveAttribute('data-logo', 'BI');
    expect(heading().className).not.toContain('sr-only');
  });

  it('name: the visible name, no logo', () => {
    renderWith('name');
    expect(side().querySelector('[data-logo]')).toBeNull();
    expect(heading().className).not.toContain('sr-only');
  });

  it('icon: the logo only; the name is a tooltip and stays a heading for screen readers', () => {
    renderWith('icon');
    expect(side().querySelector('[data-logo]')).not.toBeNull();
    expect(heading().className).toContain('sr-only');
    expect(heading().parentElement).toHaveAttribute('title', 'Billing');
  });

  it('none: no header at all, but the module is still named for screen readers and the pages are all there', () => {
    renderWith('none');
    expect(side().querySelector('[data-logo]')).toBeNull();
    expect(heading().className).toContain('sr-only');
    expect(within(screen.getByRole('navigation', { name: 'Billing pages' })).getAllByRole('link')).toHaveLength(billing.pages.length);
  });
});

describe('AppLayout: module accent', () => {
  it('recolors the accent with the module being viewed', () => {
    renderAt(billing.basePath);
    expect(accentStyles()).toHaveLength(1);
  });

  it('keeps the default accent on the dashboard', () => {
    renderAt('/');
    expect(accentStyles()).toHaveLength(0);
  });

  it('gives two modules two different accents', () => {
    const first = renderAt(billing.basePath);
    const a = accentStyles()[0].getAttribute('data-module-accent');
    first.unmount();
    renderAt(FIXTURE_NAV[1].basePath);
    expect(accentStyles()[0].getAttribute('data-module-accent')).not.toBe(a);
  });
});
