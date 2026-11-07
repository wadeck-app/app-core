import { render, renderHook, screen, within } from '@testing-library/react';
import { AbExperiments } from '@wadeck-app/dsl-ui';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { DateSettingsProvider } from '../../dates/DateFormatContext.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppLayout } from '../AppLayout.js';
import type { LoadedModuleSummary } from '../../types.js';
import { navModulesFor } from '../navModel.js';
import { FIXTURE_NAV } from '../testFixtures.js';
import { CountBadge } from './CountBadge.js';
import { SAMPLE_TERTIARY, useTertiaryNav, type TertiaryNav } from './tertiaryModel.js';
import { TertiaryTabs } from './TertiaryTabs.js';

const navStylesCss = fs.readFileSync(path.join(process.cwd(), 'src', 'navStyles.css'), 'utf8');
const nav = (activeId = 'activity', items = SAMPLE_TERTIARY): TertiaryNav => ({ items, activeId, hrefFor: (id) => `/p?tertiary=${id}` });
const inRouter = (ui: React.ReactElement, path = '/modules/billing') => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
// "Alerts, 3" is "Alerts" with its figure: the text of a link without the figure.
const textOf = (el: HTMLElement): string => (el.textContent ?? '').replace(/^(.*?)(, )?\d+$/, '$1');

describe('useTertiaryNav', () => {
  const at = (path: string) => renderHook(() => useTertiaryNav(), { wrapper: ({ children }) => <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter> }).result.current;

  it('selects the entry named in the address, the first one otherwise or when the name is unknown', () => {
    expect(at('/p?tertiary=alerts').activeId).toBe('alerts');
    expect(at('/p').activeId).toBe('summary');
    expect(at('/p?tertiary=nope').activeId).toBe('summary');
  });

  it('links to the same page with the entry selected and the other parameters kept', () => {
    expect(at('/modules/queue?range=24h').hrefFor('settings')).toBe('/modules/queue?range=24h&tertiary=settings');
    expect(at('/modules/queue?tertiary=alerts&range=24h').hrefFor('summary')).toBe('/modules/queue?tertiary=summary&range=24h');
  });
});

// Any menu entry may carry a figure; the tabs show it.
describe('the figure of an entry', () => {
  it('is shown with its number, 0 included, and not at all when the entry has none', () => {
    const { container, rerender } = render(<CountBadge count={7} />);
    expect(container.textContent).toBe(', 7');
    rerender(<CountBadge count={0} />);
    expect(container.textContent).toBe(', 0');
    rerender(<CountBadge count={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is read after the label, not glued to it: the separator is for assistive technology only', () => {
    const { container } = render(<CountBadge count={3} />);
    expect(container.querySelector('.sr-only')?.textContent).toBe(', ');
  });
});

describe('the tabs of the third level', () => {
  it('show nothing for a page without a third level', () => {
    const { container } = inRouter(<TertiaryTabs nav={nav('x', [])} label="Tabs" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('leave room between the trail above and the tabs', () => {
    inRouter(<TertiaryTabs nav={nav()} label="Tabs" />);
    expect(screen.getByRole('navigation', { name: 'Tabs' }).className).toContain('pt-3');
  });

  it('are a named navigation of links to distinct addresses, the current one marked, marked for the stylesheet of the navigation', () => {
    inRouter(<TertiaryTabs nav={nav('alerts')} label="Tabs" />);
    const tabs = screen.getByRole('navigation', { name: 'Tabs' });
    expect(tabs).toHaveAttribute('data-nav-level', 'tertiary');
    const links = within(tabs).getAllByRole('link');
    expect(links.map(textOf)).toEqual(SAMPLE_TERTIARY.map((i) => i.label));
    expect(links.map((l) => l.getAttribute('href'))).toEqual(SAMPLE_TERTIARY.map((i) => `/p?tertiary=${i.id}`));
    expect(links.filter((l) => l.getAttribute('aria-current') === 'page').map(textOf)).toEqual(['Alerts']);
  });

  it('show each figure next to its label, and none where the entry has none', () => {
    const items = [{ id: 'a', label: 'Alpha', count: 5 }, { id: 'b', label: 'Beta', count: 0 }, { id: 'c', label: 'Gamma' }];
    inRouter(<TertiaryTabs nav={nav('a', items)} label="Tabs" />);
    const figures = within(screen.getByRole('navigation', { name: 'Tabs' })).getAllByRole('link').map((l) => /(\d+)$/.exec(l.textContent ?? '')?.[1]);
    expect(figures).toEqual(['5', '0', undefined]);
  });
});

// The look of the three levels (rail) is in a stylesheet, which jsdom does not apply: what can be checked is that it reaches the
// three levels for the current entry, and that nothing in it waits for a theme to be chosen.
describe('the stylesheet of the navigation', () => {
  it('reaches the three levels for the current entry', () => {
    expect(navStylesCss).toContain("nav[aria-label='Modules']");
    expect(navStylesCss).toContain("[data-testid='shell-menu'] nav");
    expect(navStylesCss).toContain("nav[data-nav-level='tertiary']");
  });

  it('is decided: no theme attribute to switch on', () => {
    expect(navStylesCss).not.toContain('data-nav-style');
  });
});

describe('the layout', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
  });

  const billing = FIXTURE_NAV[0]!;
  // A list and the page of one of its items: the trail of the item is three long, the case that asks for a third level.
  const orders: LoadedModuleSummary[] = [
    {
      id: 'orders',
      version: '1',
      extensionPoints: [
        { kind: 'page', slot: 'nav', label: 'Items', path: '/items', view: {}, rawYaml: '' },
        { kind: 'page', slot: 'route', label: 'Item', path: '/items/:id', view: {}, rawYaml: '' },
      ],
    },
  ];
  const renderAt = (path: string, { dock = false, deep = false }: { dock?: boolean; deep?: boolean } = {}) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <AbExperiments enabled={dock ? true : undefined}>
          <DateSettingsProvider>
            <AppLayout modules={deep ? orders : []} navModules={deep ? navModulesFor(orders) : FIXTURE_NAV}>
              <p>content</p>
            </AppLayout>
          </DateSettingsProvider>
        </AbExperiments>
      </MemoryRouter>,
    );
  const ITEM_PAGE = '/modules/orders/items/42';

  it('sticks the trail under the top bar, always (decided)', () => {
    renderAt(`${billing.basePath}/p1`);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).closest('.sticky')).not.toBeNull();
  });

  it('shows no sample tabs without the A/B dock: no page declares a third level yet', () => {
    renderAt(ITEM_PAGE, { deep: true });
    expect(screen.queryByRole('navigation', { name: /sections$/ })).not.toBeInTheDocument();
  });

  it('shows nothing for a page without a third level, the dock or not: a list page, the dashboard', () => {
    const list = renderAt('/modules/orders/items', { dock: true, deep: true });
    expect(screen.queryByRole('navigation', { name: /sections$/ })).not.toBeInTheDocument();
    list.unmount();
    renderAt('/', { dock: true });
    expect(screen.queryByRole('navigation', { name: /sections$/ })).not.toBeInTheDocument();
  });

  it('with the dock, puts the tabs of an opened item in the same sticky block as the trail, under it, before the page', () => {
    renderAt(ITEM_PAGE, { dock: true, deep: true });
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const tabs = screen.getByRole('navigation', { name: /sections$/ });
    const block = trail.closest('.sticky');
    expect(block).not.toBeNull();
    expect(tabs.closest('.sticky')).toBe(block);
    // Neither sticks on its own inside the block (two sticky bars would hide each other).
    expect(block?.querySelectorAll('.sticky')).toHaveLength(0);
    const order = [trail, tabs, screen.getByText('content')];
    order.slice(1).forEach((el, i) => expect(order[i]!.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy());
  });

  it('with the dock, shows sample figures on rows of the side menu, and none without it', () => {
    const rows = () => within(screen.getByRole('navigation', { name: /pages$/ })).getAllByRole('link');
    const view = renderAt(billing.basePath, { dock: true });
    expect(rows().some((r) => /12$/.test(r.textContent ?? ''))).toBe(true);
    view.unmount();
    renderAt(billing.basePath);
    expect(rows().some((r) => /\d$/.test(r.textContent ?? ''))).toBe(false);
  });
});
