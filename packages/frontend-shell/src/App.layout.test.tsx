import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.js';
import { moduleColor } from './layout/Logo.js';

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
      ],
    },
  }),
}));

// The accent is applied on <html> as inline custom properties.
const rootAccent = () => document.documentElement.style.getPropertyValue('--color-primary-solid');

beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, '', '/modules/jobs-mod');
});

afterEach(() => {
  window.history.pushState({}, '', '/');
});

describe('App: layout', () => {
  it('shows the module tab with its logo and the module pages in the always-visible sidebar', async () => {
    render(<App />);
    expect(await screen.findByText('overview-page')).toBeInTheDocument();
    const tab = within(screen.getByRole('navigation', { name: 'Modules' })).getByRole('link', { name: 'Jobs mod' });
    expect(tab.querySelector('[data-initials]')).toHaveAttribute('data-initials', 'JM');
    expect(within(screen.getByTestId('shell-menu')).getByRole('link', { name: 'History' })).toBeInTheDocument();
  });

  it('marks the active module tab as current, and no other tab', async () => {
    render(<App />);
    expect(await screen.findByText('overview-page')).toBeInTheDocument();
    const tabs = within(screen.getByRole('navigation', { name: 'Modules' }));
    expect(tabs.getByRole('link', { name: 'Jobs mod' })).toHaveAttribute('aria-current', 'true');
    expect(tabs.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });

  it('shows no A/B test bar: every test is decided', () => {
    render(<App />);
    expect(screen.queryByTestId('ab-dock')).not.toBeInTheDocument();
  });

  it('recolors the accent with the module being viewed, and not on the dashboard', async () => {
    const { unmount } = render(<App />);
    expect(await screen.findByText('overview-page')).toBeInTheDocument();
    expect(rootAccent()).toBe(moduleColor('jobs-mod'));
    unmount();
    expect(rootAccent()).toBe('');

    window.history.pushState({}, '', '/');
    render(<App />);
    expect(rootAccent()).toBe('');
  });
});
