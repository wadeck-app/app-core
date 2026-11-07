import { render, renderHook, screen, within } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { DateSettingsProvider } from '../../dates/DateFormatContext.js';
import { AppLayout } from '../AppLayout.js';
import { BreadcrumbTrail, type BreadcrumbVariant } from '../breadcrumb/BreadcrumbTrail.js';
import { FIXTURE_NAV } from '../testFixtures.js';
import { CountBadge } from './CountBadge.js';
import type { HeaderVariant } from './StickyHeader.js';
import { SAMPLE_TERTIARY, useTertiaryNav, type TertiaryNav } from './tertiaryModel.js';
import { TertiaryPlacement } from './TertiaryPlacement.js';
import { StyledSubBar, StyledTabs } from './TertiaryStyles.js';
import { TertiaryPills, accordionEntries } from './TertiaryViews.js';
import type { TertiaryChoice } from './useTertiaryVariant.js';

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

// Any menu entry may carry a figure; every way of showing the third level shows it, the same way.
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

  const items = [
    { id: 'a', label: 'Alpha', count: 5 },
    { id: 'b', label: 'Beta', count: 0 },
    { id: 'c', label: 'Gamma' },
  ];
  const figures = (root: HTMLElement) => within(root).getAllByRole('link').map((l) => /(\d+)$/.exec(l.textContent ?? '')?.[1]);

  it.each([
    ['tabs', (n: TertiaryNav) => <StyledTabs nav={n} label="L" style="line" />],
    ['tabs band', (n: TertiaryNav) => <StyledTabs nav={n} label="L" style="band" />],
    ['sub-bar chips', (n: TertiaryNav) => <StyledSubBar nav={n} label="L" style="chips" lead="x" />],
    ['sub-bar segmented', (n: TertiaryNav) => <StyledSubBar nav={n} label="L" style="segmented" lead="x" />],
    ['sub-bar tabs', (n: TertiaryNav) => <StyledSubBar nav={n} label="L" style="tabs" lead="x" />],
    ['pills', (n: TertiaryNav) => <TertiaryPills nav={n} label="L" />],
  ])('%s shows each figure next to its label, and none where the entry has none', (_name, make) => {
    inRouter(make(nav('a', items)));
    expect(figures(screen.getByRole('navigation', { name: 'L' }))).toEqual(['5', '0', undefined]);
  });
});

describe('placements', () => {
  const expectEntries = (root: HTMLElement, activeLabel = 'Activity') => {
    const links = within(root).getAllByRole('link');
    expect(links.map(textOf)).toEqual(SAMPLE_TERTIARY.map((i) => i.label));
    expect(links.map((l) => l.getAttribute('href'))).toEqual(SAMPLE_TERTIARY.map((i) => `/p?tertiary=${i.id}`));
    expect(links.filter((l) => l.getAttribute('aria-current') === 'page').map(textOf)).toEqual([activeLabel]);
  };

  it.each(['line', 'band', 'sticky'] as const)('tabs %s', (style) => {
    inRouter(<StyledTabs nav={nav('alerts')} label="Tabs" style={style} lead={<p>the trail</p>} />);
    expectEntries(screen.getByRole('navigation', { name: 'Tabs' }), 'Alerts');
  });

  it.each(['chips', 'merged', 'segmented', 'tabs'] as const)('sub-bar %s', (style) => {
    inRouter(<StyledSubBar nav={nav()} label="Bar" style={style} lead={<span>the lead</span>} />);
    const bar = screen.getByRole('navigation', { name: 'Bar' });
    expect(within(bar).getByText('the lead')).toBeInTheDocument();
    expectEntries(bar);
  });

  it('the accordion gives plain menu entries for the shell, the current one marked as a page', () => {
    const entries = accordionEntries(nav('alerts'), '/modules/billing');
    expect(entries.map((e) => [e.label, e.href, e.current])).toEqual([
      ['Summary', '/p?tertiary=summary', undefined],
      ['Activity', '/p?tertiary=activity', undefined],
      ['Alerts', '/p?tertiary=alerts', 'page'],
      ['Settings', '/p?tertiary=settings', undefined],
    ]);
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
  });
});

describe('breadcrumb variants', () => {
  const crumbs = [{ label: 'Queue', href: '/modules/queue' }, { label: 'Events', href: '/modules/queue/events' }, { label: 'Event 42' }];

  it.each(['classic', 'sticky', 'path', 'back'] as BreadcrumbVariant[])('%s names the trail, links the parents and marks the current page', (variant) => {
    inRouter(<BreadcrumbTrail variant={variant} crumbs={crumbs} moduleId="queue" />);
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(trail).getByText('Event 42')).toBeInTheDocument();
    expect(trail.querySelector('[aria-current="page"]')?.textContent).toBe('Event 42');
    // Every link points at a parent, never at the current page.
    const hrefs = within(trail).queryAllByRole('link').map((l) => l.getAttribute('href'));
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.every((h) => h === '/modules/queue' || h === '/modules/queue/events')).toBe(true);
  });

  it('sticky sticks under the top bar', () => {
    inRouter(<BreadcrumbTrail variant="sticky" crumbs={crumbs} />);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).closest('.sticky')).not.toBeNull();
  });

  it('back keeps only the nearest parent and the current page', () => {
    inRouter(<BreadcrumbTrail variant="back" crumbs={crumbs} />);
    const trail = within(screen.getByRole('navigation', { name: 'Breadcrumb' }));
    expect(trail.getAllByRole('link').map((l) => l.textContent)).toEqual(['Events']);
  });

  it('path starts with the logo of the module and writes slashes between names', () => {
    const { container } = inRouter(<BreadcrumbTrail variant="path" crumbs={crumbs} moduleId="queue" />);
    expect(container.querySelector('[data-initials]')?.getAttribute('data-initials')).toBe('QU');
    expect(container.textContent).toContain('/Events');
  });

  it('shows nothing for an empty trail', () => {
    const { container } = inRouter(<BreadcrumbTrail variant="path" crumbs={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('placement in the page', () => {
  const crumbs = [{ label: 'Queue', href: '/modules/queue' }, { label: 'Overview' }];
  const choice = (extra: Partial<TertiaryChoice>): TertiaryChoice => ({ placement: 'tabs', tabs: 'sticky', subbar: 'chips', ...extra });
  const place = (c: TertiaryChoice, header: HeaderVariant = 'off', breadcrumb: BreadcrumbVariant = 'sticky') =>
    inRouter(
      <TertiaryPlacement choice={c} breadcrumb={breadcrumb} header={header} nav={nav()} title="Overview" moduleId="queue" crumbs={crumbs}>
        <p>the page</p>
      </TertiaryPlacement>,
    );

  it('sticks a sticky trail and sticky tabs together, in one block, so that one does not hide the other', () => {
    place(choice({}));
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const tabs = screen.getByRole('navigation', { name: 'Overview sections' });
    const block = trail.closest('.sticky');
    expect(block).not.toBeNull();
    expect(tabs.closest('.sticky')).toBe(block);
    // Neither of them sticks on its own inside the block.
    expect(block?.querySelectorAll('.sticky')).toHaveLength(0);
  });

  it('does the same for the sub-bar, the bar above the trail', () => {
    place(choice({ placement: 'subbar' }));
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const bar = screen.getByRole('navigation', { name: 'Overview sections' });
    expect(trail.parentElement).toBe(bar.parentElement);
    expect(bar.compareDocumentPosition(trail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('puts the trail, then the tabs, then the page', () => {
    place(choice({ tabs: 'line' }), 'off', 'classic');
    const order = [screen.getByRole('navigation', { name: 'Breadcrumb' }), screen.getByRole('navigation', { name: 'Overview sections' }), screen.getByText('the page')];
    order.slice(1).forEach((el, i) => expect(order[i]!.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy());
  });
});

describe('sticky header variants', () => {
  const crumbs = [{ label: 'Queue', href: '/modules/queue' }, { label: 'Overview' }];
  const variants: Array<Exclude<HeaderVariant, 'off'>> = ['stack', 'inline', 'title', 'condense', 'path', 'headroom'];
  const place = (header: HeaderVariant) =>
    inRouter(
      <TertiaryPlacement choice={{ placement: 'none', tabs: 'line', subbar: 'chips' }} breadcrumb="classic" header={header} nav={nav('alerts')} title="Overview" moduleId="queue" crumbs={crumbs}>
        <p>the page</p>
      </TertiaryPlacement>,
    );

  it.each(variants)('%s has the trail, every entry of the third level with the current one marked and its figure, and the page', (variant) => {
    place(variant);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByText('the page')).toBeInTheDocument();
    const links = within(screen.getByRole('navigation', { name: 'Overview sections' })).getAllByRole('link');
    expect(links.map(textOf)).toEqual(SAMPLE_TERTIARY.map((i) => i.label));
    expect(links.filter((l) => l.getAttribute('aria-current') === 'page').map(textOf)).toEqual(['Alerts']);
    expect(links.some((l) => /, 3$/.test(l.textContent ?? ''))).toBe(true);
  });

  it.each(variants.filter((v) => v !== 'condense'))('%s keeps the trail in a sticky block', (variant) => {
    place(variant);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).closest('.sticky')).not.toBeNull();
  });

  it('puts the third level in the same sticky block as the trail', () => {
    for (const variant of variants.filter((v) => v !== 'condense')) {
      const view = place(variant);
      const block = screen.getByRole('navigation', { name: 'Breadcrumb' }).closest('.sticky');
      expect(block?.contains(screen.getByRole('navigation', { name: 'Overview sections' }))).toBe(true);
      view.unmount();
    }
  });

  it('title row names the page and the chosen entry: the title follows the selection', () => {
    place('title');
    expect(screen.getByText(/· Alerts/).parentElement?.textContent).toBe('Overview · Alerts');
  });

  it('adds nothing for off: the separate tests decide', () => {
    place('off');
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Overview sections' })).not.toBeInTheDocument();
  });
});

describe('the A/B test in the layout', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
  });

  const renderAt = (path: string, query = '') => {
    window.history.replaceState(null, '', query === '' ? '/' : `/?${query}`);
    return render(
      <MemoryRouter initialEntries={[path]}>
        <DateSettingsProvider>
          <AppLayout modules={[]} navModules={FIXTURE_NAV}>
            <p>content</p>
          </AppLayout>
        </DateSettingsProvider>
      </MemoryRouter>,
    );
  };
  const billing = FIXTURE_NAV[0]!;

  it('adds nothing by default: the app is as it was', () => {
    renderAt(billing.basePath);
    expect(screen.queryByRole('navigation', { name: /sections$/ })).not.toBeInTheDocument();
  });

  it('puts the tabs between the trail and the page on a page of a module', () => {
    renderAt(billing.basePath, 'ab.shell-tertiary=tabs');
    const tabs = screen.getByRole('navigation', { name: /sections$/ });
    expect(within(tabs).getAllByRole('link')).toHaveLength(SAMPLE_TERTIARY.length);
    const order = [screen.getByRole('navigation', { name: 'Breadcrumb' }), tabs, screen.getByText('content')];
    order.slice(1).forEach((el, i) => expect(order[i]!.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy());
  });

  it('adds the entries under the current page of the side menu for the accordion', () => {
    renderAt(billing.basePath, 'ab.shell-tertiary=accordion');
    const menu = within(screen.getByRole('navigation', { name: /pages$/ }));
    const labels = menu.getAllByRole('link').map((l) => l.textContent);
    const at = labels.indexOf(SAMPLE_TERTIARY[0]!.label);
    expect(at).toBeGreaterThan(0);
    expect(labels.slice(at, at + SAMPLE_TERTIARY.length)).toEqual(SAMPLE_TERTIARY.map((i) => i.label));
  });

  it('a sticky header takes over from the separate tests', () => {
    renderAt(billing.basePath, 'ab.shell-header=inline&ab.shell-tertiary=tabs');
    // One third level, the header's: not the tabs of the other test on top of it.
    expect(screen.getAllByRole('navigation', { name: /sections$/ })).toHaveLength(1);
  });

  it('puts nothing on the dashboard, whatever the variant', () => {
    renderAt('/', 'ab.shell-tertiary=tabs&ab.shell-header=stack');
    expect(screen.queryByRole('navigation', { name: /sections$/ })).not.toBeInTheDocument();
  });
});
