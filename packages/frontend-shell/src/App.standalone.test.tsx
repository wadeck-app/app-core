import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.js';

vi.mock('./useModules.js', () => ({
  useModules: () => ({
    error: undefined,
    data: {
      modules: [
        {
          id: 'jobs-mod',
          version: '1.0.0',
          extensionPoints: [
            { kind: 'page', slot: 'nav', path: '/', label: 'Overview', view: {}, rawYaml: '$type: Badge\nlabel: overview-page\n' },
            { kind: 'page', slot: 'nav', path: '/history', label: 'History', view: {}, rawYaml: '$type: Badge\nlabel: history-page\n' },
          ],
        },
        { id: 'other', version: '1.0.0', extensionPoints: [{ kind: 'page', slot: 'nav', path: '/', label: 'Other', view: {}, rawYaml: '$type: Badge\nlabel: other-page\n' }] },
      ],
    },
  }),
}));

let standalone: { moduleId: string } | null = { moduleId: 'jobs-mod' };
vi.mock('./useShellSettings.js', () => ({ useShellSettings: () => ({ abTests: false, standalone }) }));

beforeEach(() => {
  localStorage.clear();
  standalone = { moduleId: 'jobs-mod' };
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  window.history.pushState({}, '', '/');
});

describe('App: an application made of one module (--module)', () => {
  it('opens "/" on the first page of the module, with no dashboard', async () => {
    render(<App />);
    expect(await screen.findByText('overview-page')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/modules/jobs-mod');
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
  });

  it('shows the module as the brand, no tabs to switch module, and the pages of the module in the menu', async () => {
    render(<App />);
    expect(await screen.findByText('overview-page')).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByText('Jobs mod')).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Modules' })).queryAllByRole('link')).toEqual([]);
    expect(within(screen.getByTestId('shell-menu')).getByRole('link', { name: 'History' })).toBeInTheDocument();
  });

  it('has no page for the dashboard-only addresses: they say the page is not found', async () => {
    window.history.pushState({}, '', '/modules-overview');
    render(<App />);
    expect(await screen.findByText(/Page not found/)).toBeInTheDocument();
  });

  it('still shows the dashboard of a normal app-core', async () => {
    standalone = null;
    render(<App />);
    expect(await within(screen.getByRole('navigation', { name: 'Modules' })).findByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });
});
