import { render, renderHook, screen, within } from '@testing-library/react';
import { AbExperiments } from '@wadeck-app/dsl-ui';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { DateSettingsProvider } from '../../dates/DateFormatContext.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppLayout } from '../AppLayout.js';
import { FIXTURE_NAV } from '../testFixtures.js';
import { NAV_STYLES, useNavStyle } from '../useNavStyle.js';
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

// The look of the three levels is in a stylesheet, which jsdom does not apply: what can be checked is that it holds each theme the
// dock offers, and nothing the dock does not offer.
describe('the stylesheet of the navigation', () => {
  const themesInCss = [...navStylesCss.matchAll(/^html\[data-nav-style='([a-z]+)'\] \{/gm)].map((m) => m[1]);

  it('has a block for every theme of the dock but today, and for no other', () => {
    const themes = Object.keys(NAV_STYLES).filter((t) => t !== 'current');
    expect(new Set(themesInCss)).toEqual(new Set(themes));
    expect(themesInCss).toHaveLength(themes.length);
  });

  it('reaches the three levels for the current entry', () => {
    expect(navStylesCss).toContain("nav[aria-label='Modules']");
    expect(navStylesCss).toContain("[data-testid='shell-menu'] nav");
    expect(navStylesCss).toContain("nav[data-nav-level='tertiary']");
  });
});

describe('useNavStyle', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
    delete document.documentElement.dataset['navStyle'];
  });
  const withChoice = (choice?: string) => {
    window.history.replaceState(null, '', choice === undefined ? '/' : `/?ab.shell-nav-style=${choice}`);
    return renderHook(() => useNavStyle(), { wrapper: ({ children }) => <AbExperiments enabled>{children}</AbExperiments> });
  };

  it('puts nothing on the page for today: the navigation keeps the look dsl-ui gives it', () => {
    withChoice();
    expect(document.documentElement.dataset['navStyle']).toBeUndefined();
  });

  it('puts the chosen theme on the page, and takes it off when the layout goes away', () => {
    const view = withChoice('soft');
    expect(view.result.current).toBe('soft');
    expect(document.documentElement.dataset['navStyle']).toBe('soft');
    view.unmount();
    expect(document.documentElement.dataset['navStyle']).toBeUndefined();
  });
});

describe('the layout', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
  });

  const billing = FIXTURE_NAV[0]!;
  const renderAt = (path: string, { dock = false }: { dock?: boolean } = {}) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <AbExperiments enabled={dock ? true : undefined}>
          <DateSettingsProvider>
            <AppLayout modules={[]} navModules={FIXTURE_NAV}>
              <p>content</p>
            </AppLayout>
          </DateSettingsProvider>
        </AbExperiments>
      </MemoryRouter>,
    );

  it('sticks the trail under the top bar, always (decided)', () => {
    renderAt(`${billing.basePath}/p1`);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).closest('.sticky')).not.toBeNull();
  });

  it('shows no sample tabs without the A/B dock: no page declares a third level yet', () => {
    renderAt(billing.basePath);
    expect(screen.queryByRole('navigation', { name: /sections$/ })).not.toBeInTheDocument();
  });

  it('with the dock, puts the tabs in the same sticky block as the trail, under it, before the page', () => {
    renderAt(`${billing.basePath}/p1`, { dock: true });
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

  it('with the dock, shows them on the dashboard too, so that the look can be judged anywhere', () => {
    renderAt('/', { dock: true });
    expect(screen.getByRole('navigation', { name: /sections$/ })).toBeInTheDocument();
  });
});
