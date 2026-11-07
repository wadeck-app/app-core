import { fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { DateSettingsProvider } from '../../dates/DateFormatContext.js';
import { AppLayout } from '../AppLayout.js';
import { FIXTURE_NAV } from '../testFixtures.js';
import { SAMPLE_TERTIARY, useTertiaryNav, type TertiaryNav } from './tertiaryModel.js';
import { TertiaryColumn, TertiaryCrumb, TertiaryPills, TertiaryRail, TertiarySubBar, TertiaryTabs, accordionEntries } from './TertiaryViews.js';

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
        <TertiaryTabs nav={nav()} label="Tabs" />
        <TertiaryPills nav={nav('alerts')} label="Pills" />
        <TertiarySubBar nav={nav('settings')} label="Bar" title="Overview" />
      </>,
    );
    expectEntries(screen.getByRole('navigation', { name: 'Tabs' }));
    expectEntries(screen.getByRole('navigation', { name: 'Pills' }), 'Alerts');
    expectEntries(screen.getByRole('navigation', { name: 'Bar' }), 'Settings');
  });

  it('column and rail wrap the page and keep it', () => {
    inRouter(
      <>
        <TertiaryColumn nav={nav()} label="Column" title="Overview">
          <p>page one</p>
        </TertiaryColumn>
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
