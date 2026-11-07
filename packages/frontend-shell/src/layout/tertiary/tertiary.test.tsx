import { render, renderHook, screen, within } from '@testing-library/react';
import { AbExperiments } from '@wadeck-app/dsl-ui';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { DateSettingsProvider } from '../../dates/DateFormatContext.js';
import { AppLayout } from '../AppLayout.js';
import { FIXTURE_NAV } from '../testFixtures.js';
import { CountBadge } from './CountBadge.js';
import { SAMPLE_TERTIARY, useTertiaryNav, type TertiaryNav } from './tertiaryModel.js';
import { TertiaryTabs, type TabsStyle } from './TertiaryTabs.js';

const STYLES: Array<Exclude<TabsStyle, 'off'>> = ['line', 'menu', 'glow', 'segmented', 'chips', 'folder'];
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

// Any menu entry may carry a figure; every style of the tabs shows it, the same way.
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
  const items = [
    { id: 'a', label: 'Alpha', count: 5 },
    { id: 'b', label: 'Beta', count: 0 },
    { id: 'c', label: 'Gamma' },
  ];

  it.each(STYLES)('%s: a named navigation of links to distinct addresses, the current one marked', (style) => {
    inRouter(<TertiaryTabs nav={nav('alerts')} label="Tabs" style={style} />);
    const links = within(screen.getByRole('navigation', { name: 'Tabs' })).getAllByRole('link');
    expect(links.map(textOf)).toEqual(SAMPLE_TERTIARY.map((i) => i.label));
    expect(links.map((l) => l.getAttribute('href'))).toEqual(SAMPLE_TERTIARY.map((i) => `/p?tertiary=${i.id}`));
    expect(links.filter((l) => l.getAttribute('aria-current') === 'page').map(textOf)).toEqual(['Alerts']);
  });

  it.each(STYLES)('%s: shows each figure next to its label, and none where the entry has none', (style) => {
    inRouter(<TertiaryTabs nav={nav('a', items)} label="Tabs" style={style} />);
    const figures = within(screen.getByRole('navigation', { name: 'Tabs' })).getAllByRole('link').map((l) => /(\d+)$/.exec(l.textContent ?? '')?.[1]);
    expect(figures).toEqual(['5', '0', undefined]);
  });

  it('segmented groups the links in one control; the others do not', () => {
    const { container } = inRouter(<TertiaryTabs nav={nav()} label="Tabs" style="segmented" />);
    expect(container.querySelector('nav > div')).not.toBeNull();
    for (const style of STYLES.filter((s) => s !== 'segmented')) {
      const view = inRouter(<TertiaryTabs nav={nav()} label="Tabs" style={style} />);
      expect(view.container.querySelector('nav > div')).toBeNull();
      view.unmount();
    }
  });

  it('glow gives the current tab the accent glow, and only that tab', () => {
    inRouter(<TertiaryTabs nav={nav('alerts')} label="Tabs" style="glow" />);
    const glowing = within(screen.getByRole('navigation', { name: 'Tabs' }))
      .getAllByRole('link')
      .filter((l) => l.style.backgroundImage !== '');
    expect(glowing.map(textOf)).toEqual(['Alerts']);
  });
});

describe('the layout', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
  });

  const billing = FIXTURE_NAV[0]!;
  const renderAt = (path: string, { dock = false, query = '' }: { dock?: boolean; query?: string } = {}) => {
    window.history.replaceState(null, '', query === '' ? '/' : `/?${query}`);
    return render(
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
  };

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

  it('with the dock, shows them on the dashboard too, so that their style can be judged anywhere', () => {
    renderAt('/', { dock: true });
    expect(screen.getByRole('navigation', { name: /sections$/ })).toBeInTheDocument();
  });

  it('the style chosen in the dock applies, and off removes the tabs', () => {
    const view = renderAt(billing.basePath, { dock: true, query: 'ab.shell-tabs-style=segmented' });
    expect(screen.getByRole('navigation', { name: /sections$/ }).querySelector('div')).not.toBeNull();
    view.unmount();
    renderAt(billing.basePath, { dock: true, query: 'ab.shell-tabs-style=off' });
    expect(screen.queryByRole('navigation', { name: /sections$/ })).not.toBeInTheDocument();
  });
});
