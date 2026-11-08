import { render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DateSettingsProvider } from '../dates/DateFormatContext.js';
import type { LoadedModuleSummary } from '../types.js';
import { AppLayout } from './AppLayout.js';
import { navModulesFor } from './navModel.js';
import { tertiaryFor, type TertiaryNav } from './tertiaryModel.js';
import { TertiaryTabs } from './TertiaryTabs.js';

const page = (slot: 'nav' | 'route', pagePath: string, label: string, extra: Record<string, unknown> = {}) => ({ kind: 'page', slot, label, path: pagePath, view: {}, rawYaml: '', ...extra });
const tab = (group: string, label: string, order?: number) => ({ tab: { group, label, ...(order === undefined ? {} : { order }) } });

// A task module the way its owner would declare it: lists in the menu, a task opened from a list with its sections as tabs, and a
// project with its views as tabs.
const TASK: LoadedModuleSummary = {
  id: 'task',
  version: '1',
  extensionPoints: [
    page('nav', '/tasks', 'Tasks'),
    page('route', '/tasks/new', 'New task'),
    page('route', '/tasks/p/:project', 'Project', tab('project', 'Tasks')),
    page('route', '/tasks/p/:project/new', 'New task'),
    page('route', '/tasks/p/:project/:id/history', 'Task history', tab('task', 'History', 20)),
    page('route', '/tasks/p/:project/:id', 'Task', tab('task', 'Details', 10)),
    page('route', '/tree/p/:project', 'Project tree', tab('project', 'Tree')),
  ] as LoadedModuleSummary['extensionPoints'],
};
const MODULES = [TASK];
const labels = (nav: TertiaryNav): string[] => nav.items.map((i) => i.label);

describe('tertiaryFor', () => {
  it('lists the pages that share the group of the page shown, sorted by order, with the parameters of the page filled in', () => {
    const nav = tertiaryFor(MODULES, '/modules/task/tasks/p/web/7');
    expect(labels(nav)).toEqual(['Details', 'History']);
    expect(nav.items.map((i) => i.href)).toEqual(['/modules/task/tasks/p/web/7', '/modules/task/tasks/p/web/7/history']);
    expect(nav.activeId).toBe('task/tasks/p/:project/:id');
  });

  it('marks the other page of the group as current when it is the one shown', () => {
    const nav = tertiaryFor(MODULES, '/modules/task/tasks/p/web/7/history');
    expect(labels(nav)).toEqual(['Details', 'History']);
    expect(nav.activeId).toBe('task/tasks/p/:project/:id/history');
  });

  it('handles a second group in the same module: the views of a project', () => {
    const nav = tertiaryFor(MODULES, '/modules/task/tasks/p/web');
    expect(labels(nav)).toEqual(['Tasks', 'Tree']);
    expect(nav.items.map((i) => i.href)).toEqual(['/modules/task/tasks/p/web', '/modules/task/tree/p/web']);
  });

  it('keeps declaration order for pages without an order, after the ones with an order', () => {
    const nav = tertiaryFor(
      [{ id: 'm', version: '1', extensionPoints: [page('route', '/a/:id', 'A', tab('g', 'Third')), page('route', '/a/:id/b', 'B', tab('g', 'Fourth')), page('route', '/a/:id/c', 'C', tab('g', 'First', 1))] as LoadedModuleSummary['extensionPoints'] }],
      '/modules/m/a/1',
    );
    expect(labels(nav)).toEqual(['First', 'Third', 'Fourth']);
  });

  it('shows nothing on a page that is not a tab, and not for a more specific page that is not one either', () => {
    expect(tertiaryFor(MODULES, '/modules/task/tasks').items).toEqual([]);
    expect(tertiaryFor(MODULES, '/modules/task/tasks/new').items).toEqual([]);
    // "/tasks/p/web/new" also fits "/tasks/p/:project/:id": the page with fewer parameters is the one shown, and it is not a tab.
    expect(tertiaryFor(MODULES, '/modules/task/tasks/p/web/new').items).toEqual([]);
  });

  it('shows nothing for an address no page has, for the dashboard and for a group left with one page', () => {
    expect(tertiaryFor(MODULES, '/').items).toEqual([]);
    expect(tertiaryFor(MODULES, '/modules/task/nowhere/1').items).toEqual([]);
    const single: LoadedModuleSummary = { id: 'm', version: '1', extensionPoints: [page('route', '/a/:id', 'A', tab('g', 'Only'))] as LoadedModuleSummary['extensionPoints'] };
    expect(tertiaryFor([single], '/modules/m/a/1').items).toEqual([]);
  });

  // flow declares the group "execution"; flow-chart adds its own page to it with "flow:execution".
  const FLOW: LoadedModuleSummary = {
    id: 'flow',
    version: '1',
    extensionPoints: [page('route', '/executions/:id', 'Execution', tab('execution', 'Summary', 10)), page('route', '/executions/:id/logs', 'Logs', tab('execution', 'Logs', 20))] as LoadedModuleSummary['extensionPoints'],
  };
  const CHART: LoadedModuleSummary = {
    id: 'flow-chart',
    version: '1',
    extensionPoints: [page('route', '/flows/runs/:id', 'Execution chart', tab('flow:execution', 'Chart', 30))] as LoadedModuleSummary['extensionPoints'],
  };

  it('joins the pages of several modules into one group: the tabs of the provider and of the module that joined it', () => {
    const nav = tertiaryFor([FLOW, CHART], '/modules/flow/executions/42');
    expect(labels(nav)).toEqual(['Summary', 'Logs', 'Chart']);
    expect(nav.items.map((i) => i.href)).toEqual(['/modules/flow/executions/42', '/modules/flow/executions/42/logs', '/modules/flow-chart/flows/runs/42']);
  });

  it('shows the same tabs on the page that joined the group, with that page as the current one', () => {
    const nav = tertiaryFor([FLOW, CHART], '/modules/flow-chart/flows/runs/42');
    expect(labels(nav)).toEqual(['Summary', 'Logs', 'Chart']);
    expect(nav.activeId).toBe('flow-chart/flows/runs/:id');
  });

  it('falls back to the provider alone when the module that joined is not there, and shows nothing for a lone page that joined', () => {
    expect(labels(tertiaryFor([FLOW], '/modules/flow/executions/42'))).toEqual(['Summary', 'Logs']);
    expect(tertiaryFor([CHART], '/modules/flow-chart/flows/runs/42').items).toEqual([]);
  });

  it('leaves out a page the module cannot use now (its optional provider is missing)', () => {
    const inactive: LoadedModuleSummary = {
      id: 'm',
      version: '1',
      extensionPoints: [page('route', '/a/:id', 'A', tab('g', 'A')), page('route', '/a/:id/b', 'B', { ...tab('g', 'B'), inactive: 'provider missing' })] as LoadedModuleSummary['extensionPoints'],
    };
    expect(tertiaryFor([inactive], '/modules/m/a/1').items).toEqual([]);
  });
});

describe('the tabs of the third level', () => {
  const nav = (activeId = '/b', items = [{ id: '/a', entryId: 'm/a', label: 'Alpha', href: '/m/a', indicator: { count: 5 } }, { id: '/b', entryId: 'm/b', label: 'Beta', href: '/m/b', indicator: { count: 0 } }, { id: '/c', entryId: 'm/c', label: 'Gamma', href: '/m/c' }]): TertiaryNav => ({ items, activeId });
  const inRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

  it('are a named navigation of links to the pages, the current one marked', () => {
    inRouter(<TertiaryTabs nav={nav()} label="Tabs" />);
    const tabs = screen.getByRole('navigation', { name: 'Tabs' });
    const links = within(tabs).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/m/a', '/m/b', '/m/c']);
    expect(links.filter((l) => l.getAttribute('aria-current') === 'page').map((l) => l.textContent?.replace(/, \d+$/, ''))).toEqual(['Beta']);
  });

  it('show each figure next to its label, and none where the entry has none', () => {
    inRouter(<TertiaryTabs nav={nav()} label="Tabs" />);
    const figures = within(screen.getByRole('navigation', { name: 'Tabs' })).getAllByRole('link').map((l) => /(\d+)$/.exec(l.textContent ?? '')?.[1]);
    expect(figures).toEqual(['5', '0', undefined]);
  });

  it('say "current" the way the rest of the navigation does (rail): a grey fill, an accent bar under the tab, only on the current one', () => {
    inRouter(<TertiaryTabs nav={nav()} label="Tabs" />);
    const [alpha, beta] = within(screen.getByRole('navigation', { name: 'Tabs' })).getAllByRole('link');
    expect(beta!.className).toContain('shadow-[inset_0_-3px_0_0_var(--color-primary)]');
    expect(beta!.className).toContain('bg-muted-bg');
    expect(alpha!.className).not.toContain('shadow-[inset');
  });

  it('show nothing for a page without a third level', () => {
    const { container } = inRouter(<TertiaryTabs nav={nav('', [])} label="Tabs" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('leave room between the trail above and the tabs', () => {
    inRouter(<TertiaryTabs nav={nav()} label="Tabs" />);
    expect(screen.getByRole('navigation', { name: 'Tabs' }).className).toContain('pt-3');
  });
});

describe('the layout', () => {
  const renderAt = (pathname: string) =>
    render(
      <MemoryRouter initialEntries={[pathname]}>
        <DateSettingsProvider>
          <AppLayout modules={MODULES} navModules={navModulesFor(MODULES)}>
            <p>content</p>
          </AppLayout>
        </DateSettingsProvider>
      </MemoryRouter>,
    );

  it('puts the tabs of an opened task in the same sticky block as the trail, under it, before the page, with no dock needed', () => {
    renderAt('/modules/task/tasks/p/web/7');
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const tabs = screen.getByRole('navigation', { name: /sections$/ });
    const block = trail.closest('.sticky');
    expect(block).not.toBeNull();
    expect(tabs.closest('.sticky')).toBe(block);
    // Neither sticks on its own inside the block (two sticky bars would hide each other).
    expect(block?.querySelectorAll('.sticky')).toHaveLength(0);
    const order = [trail, tabs, screen.getByText('content')];
    order.slice(1).forEach((el, i) => expect(order[i]!.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy());
    expect(within(tabs).getAllByRole('link').map((l) => l.textContent)).toEqual(['Details', 'History']);
  });

  it('shows no third level on a list page, and still sticks the trail', () => {
    renderAt('/modules/task/tasks');
    expect(screen.queryByRole('navigation', { name: /sections$/ })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).closest('.sticky')).not.toBeNull();
  });

  it('shows nothing on the dashboard', () => {
    renderAt('/');
    expect(screen.queryByRole('navigation', { name: /sections$/ })).not.toBeInTheDocument();
  });
});

// The figures, from the manifest to the screen: declared by a module, read from its routes, shown next to the menu entry and the tab.
describe('the figures next to the entries', () => {
  const JOBS: LoadedModuleSummary = {
    id: 'jobs',
    version: '1',
    extensionPoints: [
      page('nav', '/dlq', 'DLQ', { count: { route: '/dlq/count', field: 'total' } }),
      page('nav', '/pending', 'Pending'),
      page('route', '/jobs/:id', 'Job', tab('job', 'Overview')),
      page('route', '/jobs/:id/logs', 'Job logs', { tab: { group: 'job', label: 'Logs', count: { route: '/jobs/:id/logs/count' } } }),
    ] as LoadedModuleSummary['extensionPoints'],
  };
  const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/dlq/count') ? { total: 7 } : 3), { status: 200 }));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockClear();
  });
  const renderAt = (pathname: string) => {
    vi.stubGlobal('fetch', fetchMock);
    return render(
      <MemoryRouter initialEntries={[pathname]}>
        <DateSettingsProvider>
          <AppLayout modules={[JOBS]} navModules={navModulesFor([JOBS])}>
            <p>content</p>
          </AppLayout>
        </DateSettingsProvider>
      </MemoryRouter>,
    );
  };
  const link = (nav: string, name: RegExp) => within(screen.getByRole('navigation', { name: nav })).getByRole('link', { name });

  it('shows the figure of a menu entry read from the route its module declared, and none on an entry without one', async () => {
    renderAt('/modules/jobs/dlq');
    await waitFor(() => expect(link('Jobs pages', /^DLQ/).textContent).toMatch(/7$/));
    expect(fetchMock).toHaveBeenCalledWith('/api/modules/jobs/dlq/count', expect.anything());
    expect(link('Jobs pages', /^Pending/).textContent).toBe('Pending');
  });

  it('shows the figure of a tab, read from a route filled with the parameters of the page', async () => {
    renderAt('/modules/jobs/jobs/42');
    await waitFor(() => expect(link('Jobs sections', /^Logs/).textContent).toMatch(/3$/));
    expect(fetchMock).toHaveBeenCalledWith('/api/modules/jobs/jobs/42/logs/count', expect.anything());
    expect(link('Jobs sections', /^Overview/).textContent).toBe('Overview');
  });
});
