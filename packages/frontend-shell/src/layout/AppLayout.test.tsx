import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AppLayout } from './AppLayout.js';
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

  it('has no visible header: the active tab already names the module, which stays a heading for screen readers', () => {
    renderAt(billing.basePath);
    const side = screen.getByTestId('module-sidebar');
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
