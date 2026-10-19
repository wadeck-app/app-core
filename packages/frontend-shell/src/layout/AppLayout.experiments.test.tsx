import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LoadedModuleSummary } from '../types.js';
import { AppLayout } from './AppLayout.js';
import { navModulesFor } from './navModel.js';

const page = (slot: string, label: string, path?: string) => ({ kind: 'page', slot, label, path, view: {}, rawYaml: '' });

const modules: LoadedModuleSummary[] = [
  { id: 'flow', version: '1.0.0', extensionPoints: [page('nav', 'Flow Executions', '/executions'), page('nav', 'Flow Logs', '/logs'), page('route', 'Execution', '/executions/:id')] },
  { id: 'flow-chart', version: '1.0.0', title: 'Flow chart', extensionPoints: [page('flow:nav', 'Charts', '/charts')] },
  { id: 'queue', version: '1.0.0', extensionPoints: [page('nav', 'History', '/history')] },
];
const navModules = navModulesFor(modules);

// The A/B choice of each test is kept under ab.<id> (what the dock writes).
const choose = (choices: Record<string, string>): void => {
  for (const [id, value] of Object.entries(choices)) {
    window.localStorage.setItem(`ab.${id}`, value);
  }
};

function Where(): null {
  document.title = useLocation().pathname;
  return null;
}

function renderAt(path: string, nav = navModules) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Where />
      <Routes>
        <Route
          path="*"
          element={
            <AppLayout modules={modules} navModules={nav}>
              <p>content</p>
            </AppLayout>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

// The text of the links of a navigation, without the two letters of a logo in front.
const sideLabels = (name: string): Array<string | undefined> => within(screen.getByRole('navigation', { name })).getAllByRole('link').map((l) => l.textContent?.replace(/^(?:DA|FL|FC|QU)(?=[A-Z])/, ''));

beforeEach(() => {
  window.localStorage.clear();
});

describe('navigation experiments: menu labels', () => {
  it('keeps the labels as the module wrote them by default', () => {
    renderAt('/modules/flow/executions');
    expect(sideLabels('Flow pages')).toEqual(['Flow Executions', 'Flow Logs', 'Charts']);
  });

  it('drops the module name in front of a label when trimmed', () => {
    choose({ 'nav-labels': 'trimmed' });
    renderAt('/modules/flow/executions');
    expect(sideLabels('Flow pages')).toEqual(['Executions', 'Logs', 'Charts']);
  });
});

describe('navigation experiments: tabs', () => {
  it('shows the logos by default, none when name only', () => {
    const first = renderAt('/');
    expect(within(screen.getByRole('navigation', { name: 'Modules' })).getAllByText(/^FL$|^QU$|^FC$/).length).toBeGreaterThan(0);
    first.unmount();
    choose({ 'nav-tabs': 'name' });
    renderAt('/');
    expect(within(screen.getByRole('navigation', { name: 'Modules' })).queryByText('QU')).not.toBeInTheDocument();
  });
});

describe('navigation experiments: pages added by another module', () => {
  it('marks them with the logo of the module that added them', () => {
    choose({ 'nav-contrib': 'logo' });
    renderAt('/modules/flow/executions');
    const added = within(screen.getByRole('navigation', { name: 'Flow pages' })).getByRole('link', { name: /Charts/ });
    expect(within(added).getByText('FC')).toBeInTheDocument();
  });

  it('marks them with a puzzle named after the module when asked', () => {
    choose({ 'nav-contrib': 'puzzle' });
    renderAt('/modules/flow/executions');
    expect(screen.getByLabelText('Added by Flow chart')).toBeInTheDocument();
  });

  it('leaves the menu own pages without a mark', () => {
    choose({ 'nav-contrib': 'logo' });
    renderAt('/modules/flow/executions');
    const own = within(screen.getByRole('navigation', { name: 'Flow pages' })).getByRole('link', { name: 'Flow Executions' });
    expect(within(own).queryByText('FL')).not.toBeInTheDocument();
  });
});

describe('navigation experiments: breadcrumb', () => {
  it('shows nothing by default', () => {
    renderAt('/modules/flow/executions');
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument();
  });

  it('shows the trail with links on the earlier crumbs and the current place last', () => {
    choose({ 'nav-breadcrumb': 'trail' });
    renderAt('/modules/flow/executions/42');
    const trail = within(screen.getByRole('navigation', { name: 'Breadcrumb' }));
    expect(trail.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Flow', 'Flow Executions', 'Execution']);
    expect(trail.getByRole('link', { name: 'Flow Executions' })).toHaveAttribute('href', '/modules/flow/executions');
    expect(trail.getByText('Execution')).toHaveAttribute('aria-current', 'page');
  });

  it('says the pages like the menu: without the module name when the labels are trimmed', () => {
    choose({ 'nav-breadcrumb': 'trail', 'nav-labels': 'trimmed' });
    renderAt('/modules/flow/executions');
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Flow', 'Executions']);
  });

  it('shows nothing on the dashboard', () => {
    choose({ 'nav-breadcrumb': 'trail' });
    renderAt('/');
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument();
  });
});

describe('navigation experiments: back link', () => {
  it('links back to the page a detail page belongs to', () => {
    choose({ 'nav-breadcrumb': 'back' });
    renderAt('/modules/flow/executions/42');
    expect(within(screen.getByRole('navigation', { name: 'Back' })).getByRole('link', { name: 'Back to Flow Executions' })).toHaveAttribute('href', '/modules/flow/executions');
  });

  it('shows nothing on a menu page, which has nothing above it to go back to', () => {
    choose({ 'nav-breadcrumb': 'back' });
    renderAt('/modules/flow/executions');
    expect(screen.queryByRole('navigation', { name: 'Back' })).not.toBeInTheDocument();
  });
});

describe('navigation experiments: tab order', () => {
  const tabNames = (): Array<string | undefined> => within(screen.getByRole('navigation', { name: 'Modules' })).getAllByRole('link').map((l) => l.textContent?.replace(/^(?:FL|FC|QU)(?=[A-Z])/, ''));

  // Registered with Queue first, so that A to Z has something to change.
  const queueFirst = navModulesFor([...modules].reverse());

  it('keeps the registered order by default', () => {
    renderAt('/', queueFirst);
    expect(tabNames()).toEqual(['Dashboard', 'Queue', 'Flow']);
  });

  it('sorts the modules A to Z, the dashboard staying first', () => {
    choose({ 'nav-tab-order': 'alpha' });
    renderAt('/', queueFirst);
    expect(tabNames()).toEqual(['Dashboard', 'Flow', 'Queue']);
  });

  it('puts the module used last first, the dashboard staying first', () => {
    choose({ 'nav-tab-order': 'recent' });
    const first = renderAt('/modules/queue/history');
    first.unmount();
    renderAt('/');
    expect(tabNames()).toEqual(['Dashboard', 'Queue', 'Flow']);
  });
});

describe('navigation experiments: quick switcher', () => {
  it('is not there by default, and Ctrl+K does nothing', () => {
    renderAt('/');
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open the quick switcher' })).not.toBeInTheDocument();
  });

  it('opens from the top bar button, filters as you type, and goes to the page with Enter', () => {
    choose({ 'nav-switcher': 'button' });
    renderAt('/');
    fireEvent.click(screen.getByRole('button', { name: 'Open the quick switcher' }));
    const input = screen.getByRole('combobox', { name: 'Search pages' });
    fireEvent.change(input, { target: { value: 'queue hist' } });
    expect(within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)).toEqual(['QUHistoryQueue']);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(document.title).toBe('/modules/queue/history');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens with Ctrl+K, moves with the arrows, and says so when nothing matches', () => {
    choose({ 'nav-switcher': 'shortcut' });
    renderAt('/');
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const input = screen.getByRole('combobox', { name: 'Search pages' });
    fireEvent.change(input, { target: { value: 'flow' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(within(screen.getByRole('listbox')).getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByText('No page matches "zzz".')).toBeInTheDocument();
  });

  it('lists a page added by another module under that module', () => {
    choose({ 'nav-switcher': 'shortcut' });
    renderAt('/');
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.change(screen.getByRole('combobox', { name: 'Search pages' }), { target: { value: 'charts' } });
    const option = within(screen.getByRole('listbox')).getByRole('option');
    expect(option).toHaveTextContent('Charts');
    expect(option).toHaveTextContent('Flow');
  });
});

describe('navigation experiments: dashboard menu', () => {
  it('lists the modules by default', () => {
    renderAt('/');
    expect(sideLabels('Dashboard pages')).toEqual(['Dashboard', 'Flow', 'Queue']);
  });

  it('lists every page of every module as "Module: Page"', () => {
    choose({ 'nav-dash-menu': 'all-pages' });
    renderAt('/');
    expect(sideLabels('Dashboard pages')).toEqual(['Dashboard', 'Flow: Flow Executions', 'Flow: Flow Logs', 'Flow: Charts', 'Queue: History']);
  });

  it('lists the pages opened last, newest first, once there are some', () => {
    choose({ 'nav-dash-menu': 'recent' });
    const first = renderAt('/modules/flow/logs');
    first.unmount();
    const second = renderAt('/modules/queue/history');
    second.unmount();
    renderAt('/');
    expect(sideLabels('Dashboard pages')).toEqual(['Dashboard', 'Queue: History', 'Flow: Flow Logs']);
  });

  it('falls back to the modules until a page was opened', () => {
    choose({ 'nav-dash-menu': 'recent' });
    renderAt('/');
    expect(sideLabels('Dashboard pages')).toEqual(['Dashboard', 'Flow', 'Queue']);
  });
});
