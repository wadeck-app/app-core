import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DateSettingsProvider } from '../dates/DateFormatContext.js';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LoadedModuleSummary } from '../types.js';
import { AppLayout } from './AppLayout.js';
import { navModulesFor } from './navModel.js';

const page = (slot: string, label: string | undefined, path?: string) => ({ kind: 'page', slot, label, path, view: {}, rawYaml: '' });

const modules: LoadedModuleSummary[] = [
  { id: 'flow', version: '1.0.0', extensionPoints: [page('nav', 'Flow Executions', '/executions'), page('nav', 'Flow Logs', '/logs')] },
  { id: 'queue', version: '1.0.0', extensionPoints: [page('nav', 'History', '/history')] },
  { id: 'task', version: '1.0.0', extensionPoints: [page('nav', 'Tasks', '/tasks')] },
];

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DateSettingsProvider>
        <Routes>
          <Route
            path="*"
            element={
              <AppLayout modules={modules} navModules={navModulesFor(modules)}>
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
  within(screen.getByRole('navigation', { name })).getAllByRole('link').map((l) => l.textContent?.replace(/^(?:DA|FL|QU|TA|AT|MO)(?=[A-Z])/, ''));

const KEY = 'app-core.nav.hidden-modules';
const tabNames = (): Array<string | undefined> => linkTexts('Modules');
const openSettings = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Navigation settings' }));
};

beforeEach(() => {
  window.localStorage.clear();
});

describe('modules hidden by the user', () => {
  it('are not in the top bar nor in the dashboard menu', () => {
    window.localStorage.setItem(KEY, JSON.stringify(['queue']));
    renderAt('/');
    expect(tabNames()).toEqual(['Dashboard', 'Flow', 'Task']);
    expect(linkTexts('Dashboard pages')).toEqual(['Dashboard', 'Flow', 'Task', 'Modules', 'A/B tests']);
  });

  it('are hidden from the navigation settings, which keep the choice in this browser and keep listing them to show them again', () => {
    renderAt('/');
    openSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Hide Queue' }));
    expect(tabNames()).toEqual(['Dashboard', 'Flow', 'Task']);
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? '[]')).toEqual(['queue']);
    // Still in the list, said as hidden, with the way back.
    const row = within(screen.getByRole('list', { name: 'Module tabs' })).getByText('Queue').closest('li') as HTMLElement;
    expect(within(row).getByText('Hidden')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show Queue' }));
    expect(tabNames()).toEqual(['Dashboard', 'Flow', 'Queue', 'Task']);
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? '[]')).toEqual([]);
  });

  it('keep their place in the order while hidden, and can still be moved', () => {
    window.localStorage.setItem(KEY, JSON.stringify(['queue']));
    renderAt('/');
    openSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Move Queue later' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show Queue' }));
    expect(tabNames()).toEqual(['Dashboard', 'Flow', 'Task', 'Queue']);
  });

  it('still open by their address, with their side menu', () => {
    window.localStorage.setItem(KEY, JSON.stringify(['queue']));
    renderAt('/modules/queue/history');
    expect(linkTexts('Queue pages')).toEqual(['History']);
    expect(tabNames()).toEqual(['Dashboard', 'Flow', 'Task']);
  });

  it('can all be hidden: the dashboard stays, and the settings still list every module', () => {
    renderAt('/');
    openSettings();
    for (const name of ['Flow', 'Queue', 'Task']) {
      fireEvent.click(screen.getByRole('button', { name: `Hide ${name}` }));
    }
    expect(tabNames()).toEqual(['Dashboard']);
    expect(screen.getByRole('button', { name: 'Show Flow' })).toBeInTheDocument();
  });

  it('say how to get them back, in the settings', () => {
    renderAt('/');
    openSettings();
    expect(screen.getByText(/hidden modules are not in the top bar or the dashboard menu/i)).toBeInTheDocument();
  });

  it('go back with the reset, which is offered as soon as one is hidden', () => {
    renderAt('/');
    openSettings();
    expect(screen.getByRole('button', { name: 'Reset to default' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Hide Task' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
    expect(tabNames()).toEqual(['Dashboard', 'Flow', 'Queue', 'Task']);
    expect(window.localStorage.getItem(KEY)).toBe('[]');
  });

  it('say so when the saved list is unreadable, and show every module', () => {
    window.localStorage.setItem(KEY, '{not json');
    renderAt('/');
    expect(tabNames()).toEqual(['Dashboard', 'Flow', 'Queue', 'Task']);
  });
});
