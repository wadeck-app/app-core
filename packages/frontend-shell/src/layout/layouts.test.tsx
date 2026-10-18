import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { LayoutByVariant } from './LayoutByVariant.js';
import { LayoutLab, fakeNavModules } from './LayoutLab.js';
import { SidebarTreeLayout } from './SidebarTreeLayout.js';
import { SIDEBAR_COLLAPSED_KEY, TopTabsLayout } from './TopTabsLayout.js';

const navModules = fakeNavModules('a');
const billing = navModules[0];

const renderAt = (path: string, ui: React.ReactElement) => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
});

describe('TopTabsLayout (variant A)', () => {
  const ui = (collapsible = false) => (
    <TopTabsLayout modules={[]} navModules={navModules} collapsible={collapsible}>
      <p>content</p>
    </TopTabsLayout>
  );

  it('shows only module names in the top bar, never their pages', () => {
    renderAt(billing.basePath, ui());
    const tabs = within(screen.getByRole('navigation', { name: 'Modules' }));
    expect(tabs.getAllByRole('link').map((l) => l.textContent)).toEqual(['Dashboard', 'Billing', 'Inventory', 'Reports', 'Audit log', 'Settings']);
  });

  it('marks the active module tab and lists only its pages in the sidebar', () => {
    renderAt(`${billing.basePath}/1`, ui());
    expect(screen.getByRole('link', { name: 'Billing' })).toHaveAttribute('aria-current', 'true');
    const side = within(screen.getByRole('navigation', { name: 'Billing pages' }));
    expect(side.getAllByRole('link').map((l) => l.textContent)).toEqual(billing.pages.map((p) => p.label));
    expect(side.getByRole('link', { name: 'Invoices' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Suppliers' })).not.toBeInTheDocument();
  });

  it('shows no sidebar for a module with a single page, and none on the dashboard', () => {
    const { unmount } = renderAt(navModules[4].basePath, ui());
    expect(screen.queryByTestId('module-sidebar')).not.toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
    unmount();
    renderAt('/', ui());
    expect(screen.queryByTestId('module-sidebar')).not.toBeInTheDocument();
  });

  it('has no collapse button unless collapsible', () => {
    renderAt(billing.basePath, ui());
    expect(screen.queryByRole('button', { name: /sidebar/i })).not.toBeInTheDocument();
  });

  it('collapsible: shrinks to an icon rail that keeps pages reachable by name, and remembers the choice', () => {
    const { unmount } = renderAt(billing.basePath, ui(true));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(screen.getByTestId('module-sidebar')).toHaveAttribute('data-collapsed', 'true');
    expect(screen.getByRole('link', { name: 'Invoices' })).toHaveAttribute('title', 'Invoices');
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('1');
    unmount();

    renderAt(billing.basePath, ui(true));
    expect(screen.getByTestId('module-sidebar')).toHaveAttribute('data-collapsed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(screen.getByTestId('module-sidebar')).toHaveAttribute('data-collapsed', 'false');
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('0');
  });
});

describe('SidebarTreeLayout (variant B)', () => {
  const ui = (
    <SidebarTreeLayout modules={[]} navModules={navModules}>
      <p>content</p>
    </SidebarTreeLayout>
  );

  it('expands only the active module and collapses the others', () => {
    renderAt(`${billing.basePath}/1`, ui);
    expect(screen.getByRole('button', { name: 'Billing' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Inventory' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('link', { name: 'Invoices' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Suppliers' })).not.toBeInTheDocument();
  });

  it('lets the user open and close any module section', () => {
    renderAt(billing.basePath, ui);
    fireEvent.click(screen.getByRole('button', { name: 'Inventory' }));
    expect(screen.getByRole('link', { name: 'Suppliers' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Billing' }));
    expect(screen.queryByRole('link', { name: 'Invoices' })).not.toBeInTheDocument();
  });

  it('shows module and page in the breadcrumb', () => {
    renderAt(`${billing.basePath}/1`, ui);
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText(/Invoices/)).toBeInTheDocument();
  });
});

describe('LayoutByVariant: D variants (sidebar always visible)', () => {
  const ui = (variant: 'd' | 'd1' | 'd2' | 'd3' | 'd4' | 'd5' | 'd6' | 'd7') => (
    <LayoutByVariant variant={variant} modules={[]} navModules={navModules}>
      <p>content</p>
    </LayoutByVariant>
  );
  const single = navModules[4];

  it.each(['d', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7'] as const)('%s: keeps the sidebar for a module with a single page', (variant) => {
    renderAt(single.basePath, ui(variant));
    const side = within(screen.getByTestId('module-sidebar'));
    expect(side.getByRole('link', { name: 'General' })).toHaveAttribute('aria-current', 'page');
  });

  it('on the dashboard, lists the dashboard and one quick-launch entry per module', () => {
    renderAt('/', ui('d'));
    const side = within(screen.getByRole('navigation', { name: 'Dashboard pages' }));
    expect(side.getAllByRole('link').map((l) => l.textContent)).toEqual(['Dashboard', ...navModules.map((m) => m.title)]);
    expect(side.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    expect(side.getByRole('link', { name: 'Billing' })).toHaveAttribute('href', navModules[0].pages[0].routePath);
  });

  it('shows the pages of the active module, as in A', () => {
    renderAt(`${billing.basePath}/1`, ui('d'));
    expect(within(screen.getByRole('navigation', { name: 'Billing pages' })).getAllByRole('link')).toHaveLength(billing.pages.length);
  });

  it('each variant has its own look, and only the avatar looks show the module logo in the sidebar header', () => {
    const looks = (['d', 'd1', 'd2', 'd3'] as const).map((variant) => {
      const { unmount } = renderAt(billing.basePath, ui(variant));
      const aside = screen.getByTestId('module-sidebar');
      const result = [aside.getAttribute('data-look'), aside.querySelector('[data-logo]') !== null];
      unmount();
      return result;
    });
    expect(looks).toEqual([
      ['plain', false],
      ['accent', false],
      ['pills', true],
      ['dark', true],
    ]);
  });

  const logosIn = (root: HTMLElement) => Array.from(root.querySelectorAll('[data-logo]')).map((l) => l.getAttribute('data-logo'));

  it('D2/D3 show a 1-letter logo, D4/D5 a 2-letter one, in the sidebar header', () => {
    const header = (variant: 'd2' | 'd3' | 'd4' | 'd5') => {
      const { unmount } = renderAt(billing.basePath, ui(variant));
      const logos = logosIn(screen.getByTestId('module-sidebar'));
      unmount();
      return logos;
    };
    expect([header('d2'), header('d3'), header('d4'), header('d5')]).toEqual([['B'], ['B'], ['BI'], ['BI']]);
  });

  it('D6/D7: colored logos also in the top tabs, and before every dashboard shortcut', () => {
    for (const variant of ['d6', 'd7'] as const) {
      const { unmount } = renderAt('/', ui(variant));
      expect(logosIn(screen.getByRole('navigation', { name: 'Modules' }))).toEqual(['BI', 'IN', 'RE', 'AL', 'SE']);
      // Dashboard shortcuts: the dashboard itself, then one per module.
      expect(logosIn(screen.getByRole('navigation', { name: 'Dashboard pages' }))).toEqual(['DA', 'BI', 'IN', 'RE', 'AL', 'SE']);
      unmount();
    }
  });

  it('D4/D5 have no logo in the tabs nor on the shortcuts', () => {
    renderAt('/', ui('d4'));
    expect(logosIn(screen.getByRole('navigation', { name: 'Modules' }))).toEqual([]);
    expect(logosIn(screen.getByRole('navigation', { name: 'Dashboard pages' }))).toEqual([]);
  });

  it('D6 gives each module its own color, the same one in the tabs and in the sidebar', () => {
    renderAt(billing.basePath, ui('d6'));
    const tab = within(screen.getByRole('navigation', { name: 'Modules' })).getByRole('link', { name: 'Billing' }).querySelector<HTMLElement>('[data-logo]')!;
    const header = screen.getByTestId('module-sidebar').querySelector<HTMLElement>('[data-logo]')!;
    expect(header.style.backgroundColor).toBe(tab.style.backgroundColor);
    expect(header.style.backgroundColor).not.toBe('');
  });

  it('A and C still hide the sidebar for a single-page module', () => {
    renderAt(single.basePath, <LayoutByVariant variant="a" modules={[]} navModules={navModules}><p>x</p></LayoutByVariant>);
    expect(screen.queryByTestId('module-sidebar')).not.toBeInTheDocument();
  });
});

describe('LayoutLab', () => {
  it('renders the requested variant with a switcher listing every variant', () => {
    renderAt('/__layout-lab/b', <LayoutLab />);
    expect(screen.getByRole('button', { name: 'Billing' })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Layout' })).getAllByRole('link')).toHaveLength(11);
  });

  it('switches variant while staying on the same module page', () => {
    renderAt('/__layout-lab/a/billing/1', <LayoutLab />);
    const switcher = within(screen.getByRole('navigation', { name: 'Layout' }));
    expect(switcher.getByRole('link', { name: 'A' })).toHaveAttribute('aria-current', 'true');
    expect(switcher.getByRole('link', { name: 'B' })).toHaveAttribute('href', '/__layout-lab/b/billing/1');
    expect(switcher.getByRole('link', { name: 'C' })).toHaveAttribute('href', '/__layout-lab/c/billing/1');
  });

  it('fails loudly on an unknown variant and points to the valid ones', () => {
    renderAt('/__layout-lab/zzz', <LayoutLab />);
    expect(screen.getByRole('alert')).toHaveTextContent('Unknown layout variant "zzz"');
    expect(screen.getByRole('link', { name: '/__layout-lab/a' })).toBeInTheDocument();
  });
});
