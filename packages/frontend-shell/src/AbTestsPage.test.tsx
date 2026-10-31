import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AbExperiments } from '@wadeck-app/dsl-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AbTestsPage } from './AbTestsPage.js';
import { SEEN_KEY } from './abTestsSeen.js';
import type { LoadedModuleSummary } from './types.js';

const modules: LoadedModuleSummary[] = [
  {
    id: 'flow',
    version: '1',
    title: 'Flow',
    extensionPoints: [
      { kind: 'page', slot: 'nav', label: 'Executions', path: '/executions', view: {}, rawYaml: '' },
      { kind: 'page', slot: 'route', label: 'Logs', path: '/executions/:id/logs', view: {}, rawYaml: '' },
    ],
  },
];

const inventory = {
  exact: 1,
  estimated: 2,
  total: 3,
  views: [{ moduleId: 'flow', id: 'flow-logs-design', label: 'Log view', where: 'page route /executions/:id/logs', point: { moduleId: 'flow', index: 1, kind: 'page', slot: 'route', path: '/executions/:id/logs', label: 'Logs' } }],
  components: [
    { moduleId: 'flow', label: 'Grouping' },
    { moduleId: 'flow', label: undefined },
  ],
  componentUse: { flow: [{ moduleId: 'flow', index: 0, kind: 'page', slot: 'nav', path: '/executions', label: 'Executions' }] },
  unreadable: [],
};

const answer = (body: unknown, status = 200): void => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));
};
const renderPage = (dock = false) =>
  render(
    <MemoryRouter>
      <AbExperiments enabled={dock}>
        <AbTestsPage modules={modules} />
      </AbExperiments>
    </MemoryRouter>,
  );

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AbTestsPage', () => {
  it('lists the tests declared in views with a link to where they are, and the ones in code with the pages that use the module', async () => {
    answer(inventory);
    renderPage();
    const views = within(await screen.findByRole('region', { name: 'Declared in views (exact)' }));
    expect(views.getByText('Log view')).toBeInTheDocument();
    expect(views.getByText('flow-logs-design')).toBeInTheDocument();
    // A route with a parameter leads to the list it hangs from, and says so.
    expect(views.getByRole('link', { name: /Flow: Logs \(\/executions\/:id\/logs\)/ })).toHaveAttribute('href', '/modules/flow/executions');
    expect(views.getByText(/open an item of this list/)).toBeInTheDocument();

    const code = within(screen.getByRole('region', { name: 'Written in module code (estimated)' }));
    expect(code.getByText('Grouping')).toBeInTheDocument();
    expect(code.getByText('(label built by the code)')).toBeInTheDocument();
    expect(code.getAllByRole('link', { name: 'Flow: Executions (/executions)' })[0]).toHaveAttribute('href', '/modules/flow/executions');
    expect(screen.getByText(/declared: 1 in module views \(exact\), 2 in module code \(estimated/)).toBeInTheDocument();
  });

  it('shows where a test was seen in this browser, exactly, for views and for code', async () => {
    window.localStorage.setItem(
      SEEN_KEY,
      JSON.stringify({ 'flow-logs-design': { label: 'Log view', paths: ['/modules/flow/executions/42/logs'] }, 'some-id': { label: 'Grouping', paths: ['/modules/flow/executions/42/logs'] } }),
    );
    answer(inventory);
    renderPage(true);
    const seenLinks = await screen.findAllByRole('link', { name: '/modules/flow/executions/42/logs' });
    expect(seenLinks).toHaveLength(2);
    expect(seenLinks[0]).toHaveAttribute('href', '/modules/flow/executions/42/logs');
    // Each test of the table is accounted for, so the "not found by the scan" section is absent.
    expect(screen.queryByText('Seen in this browser, but not found by the scan')).not.toBeInTheDocument();
  });

  it('lists what the dock showed and the scan did not find, which is a blind spot worth seeing', async () => {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify({ 'ghost-id': { label: 'Ghost test', paths: ['/modules/x/y'] } }));
    answer(inventory);
    renderPage(true);
    const section = within(await screen.findByRole('region', { name: 'Seen in this browser, but not found by the scan' }));
    expect(section.getByText('Ghost test')).toBeInTheDocument();
    expect(section.getByText('ghost-id')).toBeInTheDocument();
    expect(section.getByRole('link', { name: '/modules/x/y' })).toBeInTheDocument();
  });

  it('says the dock is off, and how to turn it on, when it is', async () => {
    answer(inventory);
    renderPage(false);
    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('The dock is off');
    expect(notice).toHaveTextContent('app-core-cli serve --ab-tests');
  });

  it('does not say it when the dock is on', async () => {
    answer(inventory);
    renderPage(true);
    await screen.findByText('Log view');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('names a module it could not read, and says why the list cannot be shown when the server fails', async () => {
    answer({ ...inventory, unreadable: [{ moduleId: 'broken', reason: 'cannot read x' }] });
    const { unmount } = renderPage();
    expect(await screen.findByText(/broken: its components could not be read, so its code tests are not counted \(cannot read x\)/)).toBeInTheDocument();
    unmount();

    answer({ error: 'not-found' }, 404);
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot list the A/B tests');
  });
});
