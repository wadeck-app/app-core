import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DateSettingsProvider } from '../dates/DateFormatContext.js';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LoadedModuleSummary } from '../types.js';
import { AppLayout } from './AppLayout.js';
import { navModulesFor } from './navModel.js';

const page = (slot: string, label: string | undefined, path?: string) => ({ kind: 'page', slot, label, path, view: {}, rawYaml: '' });

const modules: LoadedModuleSummary[] = [
  { id: 'flow', version: '1.0.0', extensionPoints: [page('nav', 'Flow Executions', '/executions'), page('nav', 'Flow Logs', '/logs'), page('route', 'Execution', '/executions/:id')] },
  { id: 'queue', version: '1.0.0', extensionPoints: [page('nav', 'History', '/history')] },
  { id: 'task', version: '1.0.0', extensionPoints: [page('nav', 'Tasks', '/tasks')] },
];

function renderAt(path: string, nav = navModulesFor(modules)) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DateSettingsProvider>
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
      </DateSettingsProvider>
    </MemoryRouter>,
  );
}

// The text of the links of a navigation, without the two letters of a logo in front.
const linkTexts = (name: string): Array<string | undefined> =>
  within(screen.getByRole('navigation', { name })).getAllByRole('link').map((l) => l.textContent?.replace(/^(?:DA|FL|QU|TA|AT)(?=[A-Z])/, ''));

beforeEach(() => {
  window.localStorage.clear();
});

describe('menu labels', () => {
  it('drop the module name the tab already says', () => {
    renderAt('/modules/flow/executions');
    expect(linkTexts('Flow pages')).toEqual(['Executions', 'Logs']);
  });

  it('are left as they are on the dashboard menu, which lists modules', () => {
    renderAt('/');
    expect(linkTexts('Dashboard pages')).toEqual(['Dashboard', 'Flow', 'Queue', 'Task', 'A/B tests']);
  });
});

describe('breadcrumb', () => {
  it('is not shown on the dashboard', () => {
    renderAt('/');
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument();
  });

  it('shows the nested pages down to the current one, saying the pages like the menu', () => {
    renderAt('/modules/flow/executions/42');
    const trail = within(screen.getByRole('navigation', { name: 'Breadcrumb' }));
    expect(trail.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Flow', 'Executions', 'Execution 42']);
    expect(trail.getByRole('link', { name: 'Executions' })).toHaveAttribute('href', '/modules/flow/executions');
    expect(trail.getByText('Execution 42')).toHaveAttribute('aria-current', 'page');
  });
});

describe('tab order, chosen by the user', () => {
  const tabNames = (): Array<string | undefined> => linkTexts('Modules');

  it('is the order the modules were registered in by default', () => {
    renderAt('/');
    expect(tabNames()).toEqual(['Dashboard', 'Flow', 'Queue', 'Task']);
  });

  it('follows the saved order, the dashboard staying first and a module the order does not know coming last', () => {
    window.localStorage.setItem('app-core.nav.tab-order', JSON.stringify(['task', 'flow']));
    renderAt('/');
    expect(tabNames()).toEqual(['Dashboard', 'Task', 'Flow', 'Queue']);
  });

  it('is changed from the navigation settings, which keep the choice in this browser', () => {
    renderAt('/');
    fireEvent.click(screen.getByRole('button', { name: 'Navigation settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Flow later' }));
    expect(tabNames()).toEqual(['Dashboard', 'Queue', 'Flow', 'Task']);
    expect(JSON.parse(window.localStorage.getItem('app-core.nav.tab-order') ?? '[]')).toEqual(['queue', 'flow', 'task']);
  });

  it('cannot move the first module earlier nor the last one later', () => {
    renderAt('/');
    fireEvent.click(screen.getByRole('button', { name: 'Navigation settings' }));
    expect(screen.getByRole('button', { name: 'Move Flow earlier' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Task later' })).toBeDisabled();
  });

  it('goes back to the default order from the settings, which offer it only once the order was changed', () => {
    renderAt('/');
    fireEvent.click(screen.getByRole('button', { name: 'Navigation settings' }));
    expect(screen.getByRole('button', { name: 'Default order' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Move Flow later' }));
    fireEvent.click(screen.getByRole('button', { name: 'Default order' }));
    expect(tabNames()).toEqual(['Dashboard', 'Flow', 'Queue', 'Task']);
    expect(window.localStorage.getItem('app-core.nav.tab-order')).toBe('[]');
  });

  it('says so when the saved order is unreadable, and uses the default one', () => {
    window.localStorage.setItem('app-core.nav.tab-order', '{not json');
    renderAt('/');
    expect(tabNames()).toEqual(['Dashboard', 'Flow', 'Queue', 'Task']);
  });
});
