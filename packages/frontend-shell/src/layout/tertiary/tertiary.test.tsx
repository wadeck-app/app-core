import { fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { DateSettingsProvider } from '../../dates/DateFormatContext.js';
import { AppLayout } from '../AppLayout.js';
import { FIXTURE_NAV } from '../testFixtures.js';
import { SAMPLE_TERTIARY, useTertiaryNav, type TertiaryNav } from './tertiaryModel.js';
import { StyledColumn, StyledSubBar, StyledTabs } from './TertiaryStyles.js';
import { TertiaryCrumb, TertiaryPills, TertiaryRail, accordionEntries } from './TertiaryViews.js';
import { BreadcrumbTrail, type BreadcrumbVariant } from '../breadcrumb/BreadcrumbTrail.js';
import { TertiaryPlacement } from './TertiaryPlacement.js';
import type { TertiaryChoice } from './useTertiaryVariant.js';

const nav = (activeId = 'activity'): TertiaryNav => ({ items: SAMPLE_TERTIARY, activeId, hrefFor: (id) => `/p?tertiary=${id}` });
const inRouter = (ui: React.ReactElement, path = '/modules/billing') => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

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

// Every placement shows the same entries, links them, and marks the current one the same way.
describe('placements', () => {
  const expectEntries = (root: HTMLElement, activeLabel = 'Activity') => {
    const links = within(root).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(SAMPLE_TERTIARY.map((i) => i.label));
    expect(links.map((l) => l.getAttribute('href'))).toEqual(SAMPLE_TERTIARY.map((i) => `/p?tertiary=${i.id}`));
    expect(links.filter((l) => l.getAttribute('aria-current') === 'page').map((l) => l.textContent)).toEqual([activeLabel]);
  };

  it('tabs, pills and sub-bar are a named navigation of links', () => {
    inRouter(
      <>
        <StyledTabs nav={nav()} label="Tabs" style="line" />
        <TertiaryPills nav={nav('alerts')} label="Pills" />
        <StyledSubBar nav={nav('settings')} label="Bar" style="chips" lead="Overview" />
      </>,
    );
    expectEntries(screen.getByRole('navigation', { name: 'Tabs' }));
    expectEntries(screen.getByRole('navigation', { name: 'Pills' }), 'Alerts');
    expectEntries(screen.getByRole('navigation', { name: 'Bar' }), 'Settings');
  });

  it('column and rail wrap the page and keep it', () => {
    inRouter(
      <>
        <StyledColumn nav={nav()} label="Column" title="Overview" style="plain">
          <p>page one</p>
        </StyledColumn>
        <TertiaryRail nav={nav()} label="Rail">
          <p>page two</p>
        </TertiaryRail>
      </>,
    );
    expectEntries(screen.getByRole('navigation', { name: 'Column' }));
    expectEntries(screen.getByRole('navigation', { name: 'Rail' }));
    expect(screen.getByText('page one')).toBeInTheDocument();
    expect(screen.getByText('page two')).toBeInTheDocument();
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

  it('the breadcrumb switcher shows the current entry, opens a menu of links, closes on Escape and on a choice', () => {
    inRouter(
      <ol>
        <TertiaryCrumb nav={nav('alerts')} />
      </ol>,
    );
    const button = screen.getByRole('button', { name: /Alerts/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(SAMPLE_TERTIARY.map((i) => i.label));
    expect(items.map((i) => i.getAttribute('href'))).toEqual(SAMPLE_TERTIARY.map((i) => `/p?tertiary=${i.id}`));
    expect(items.filter((i) => i.getAttribute('aria-current') === 'page').map((i) => i.textContent)).toEqual(['Alerts']);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

// The looks of the three families keep the same entries, links and current mark.
describe('looks', () => {
  const entries = (root: HTMLElement) => within(root).getAllByRole('link');

  it.each(['line', 'count', 'band', 'sticky'] as const)('tabs %s', (style) => {
    inRouter(<StyledTabs nav={nav('alerts')} label="Tabs" style={style} lead={<p>the trail</p>} />);
    const links = entries(screen.getByRole('navigation', { name: 'Tabs' }));
    expect(links.map((l) => l.getAttribute('href'))).toEqual(SAMPLE_TERTIARY.map((i) => `/p?tertiary=${i.id}`));
    expect(links.filter((l) => l.getAttribute('aria-current') === 'page').map((l) => l.textContent?.replace(/\d+$/, ''))).toEqual(['Alerts']);
    // Counts only in the look that shows them.
    expect(links.some((l) => /\d/.test(l.textContent ?? ''))).toBe(style === 'count');
  });

  it.each(['chips', 'merged', 'segmented', 'tabs'] as const)('sub-bar %s', (style) => {
    inRouter(<StyledSubBar nav={nav()} label="Bar" style={style} lead={<span>the lead</span>} />);
    const bar = screen.getByRole('navigation', { name: 'Bar' });
    expect(within(bar).getByText('the lead')).toBeInTheDocument();
    expect(entries(bar).map((l) => l.textContent)).toEqual(SAMPLE_TERTIARY.map((i) => i.label));
    expect(entries(bar).filter((l) => l.getAttribute('aria-current') === 'page').map((l) => l.textContent)).toEqual(['Activity']);
  });

  it.each(['plain', 'collapsible', 'card', 'headed'] as const)('column %s', (style) => {
    window.localStorage.clear();
    inRouter(
      <StyledColumn nav={nav()} label="Column" title="Overview" style={style}>
        <p>the page</p>
      </StyledColumn>,
    );
    const links = entries(screen.getByRole('navigation', { name: 'Column' }));
    expect(links).toHaveLength(SAMPLE_TERTIARY.length);
    expect(links.filter((l) => l.getAttribute('aria-current') === 'page')).toHaveLength(1);
    expect(screen.getByText('the page')).toBeInTheDocument();
    // The second line only in the look that has it.
    expect(screen.queryByText('Latest events') !== null).toBe(style === 'headed');
  });

  it('the collapsible column folds to initials, names the entries for assistive technology and remembers it', () => {
    window.localStorage.clear();
    const view = inRouter(
      <StyledColumn nav={nav()} label="Column" title="Overview" style="collapsible">
        <p>page</p>
      </StyledColumn>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Column' }));
    const folded = entries(screen.getByRole('navigation', { name: 'Column' }));
    expect(folded.map((l) => l.textContent)).toEqual(['Su', 'Ac', 'Al', 'Se']);
    expect(folded.map((l) => l.getAttribute('aria-label'))).toEqual(SAMPLE_TERTIARY.map((i) => i.label));
    expect(window.localStorage.getItem('app-core.tertiary-column-collapsed')).toBe('true');
    view.unmount();
    inRouter(
      <StyledColumn nav={nav()} label="Column" title="Overview" style="collapsible">
        <p>page</p>
      </StyledColumn>,
    );
    expect(screen.getByRole('button', { name: 'Expand Column' })).toHaveAttribute('aria-expanded', 'false');
    window.localStorage.clear();
  });
});

describe('breadcrumb variants', () => {
  const crumbs = [{ label: 'Queue', href: '/modules/queue' }, { label: 'Events', href: '/modules/queue/events' }, { label: 'Event 42' }];

  it.each(['classic', 'sticky', 'path', 'back', 'right', 'bar'] as BreadcrumbVariant[])('%s names the trail, links the parents and marks the current page', (variant) => {
    inRouter(<BreadcrumbTrail variant={variant} crumbs={crumbs} moduleId="queue" />);
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(trail).getByText('Event 42')).toBeInTheDocument();
    expect(trail.querySelector('[aria-current="page"]')?.textContent).toBe('Event 42');
    // Every link points at a parent, never at the current page.
    const hrefs = within(trail).queryAllByRole('link').map((l) => l.getAttribute('href'));
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.every((h) => h === '/modules/queue' || h === '/modules/queue/events')).toBe(true);
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

describe('sticky trail with a sticky bar', () => {
  const crumbs = [{ label: 'Queue', href: '/modules/queue' }, { label: 'Overview' }];
  const place = (choice: Partial<TertiaryChoice>) =>
    inRouter(
      <TertiaryPlacement choice={{ placement: 'tabs', tabs: 'sticky', subbar: 'chips', column: 'plain', ...choice }} breadcrumb="sticky" nav={nav()} title="Overview" moduleId="queue" crumbs={crumbs}>
        <p>the page</p>
      </TertiaryPlacement>,
    );

  it('sticks the trail and the tabs together, in one block, so that one does not hide the other', () => {
    place({});
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const tabs = screen.getByRole('navigation', { name: 'Overview sections' });
    const block = trail.closest('.sticky');
    expect(block).not.toBeNull();
    expect(tabs.closest('.sticky')).toBe(block);
    // Neither of them sticks on its own inside the block.
    expect(block?.querySelectorAll('.sticky')).toHaveLength(0);
  });

  it('does the same for the sub-bar, the bar above the trail', () => {
    place({ placement: 'subbar' });
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const bar = screen.getByRole('navigation', { name: 'Overview sections' });
    expect(trail.parentElement).toBe(bar.parentElement);
    expect(bar.compareDocumentPosition(trail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('the A/B test in the layout', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
  });

  const renderAt = (path: string, variant?: string) => {
    window.history.replaceState(null, '', variant === undefined ? '/' : `/?ab.shell-tertiary=${variant}`);
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
    renderAt(billing.basePath, 'tabs');
    const tabs = screen.getByRole('navigation', { name: /sections$/ });
    expect(within(tabs).getAllByRole('link')).toHaveLength(SAMPLE_TERTIARY.length);
    // The trail comes first, then the entries, then the page.
    const order = [screen.getByRole('navigation', { name: 'Breadcrumb' }), tabs, screen.getByText('content')];
    order.slice(1).forEach((el, i) => expect(order[i]!.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy());
  });

  it('adds the entries under the current page of the side menu for the accordion', () => {
    renderAt(billing.basePath, 'accordion');
    const menu = within(screen.getByRole('navigation', { name: /pages$/ }));
    const labels = menu.getAllByRole('link').map((l) => l.textContent);
    const at = labels.indexOf(SAMPLE_TERTIARY[0]!.label);
    expect(at).toBeGreaterThan(0);
    expect(labels.slice(at, at + SAMPLE_TERTIARY.length)).toEqual(SAMPLE_TERTIARY.map((i) => i.label));
  });

  it('puts nothing on the dashboard, whatever the variant', () => {
    renderAt('/', 'tabs');
    expect(screen.queryByRole('navigation', { name: /sections$/ })).not.toBeInTheDocument();
  });
});
