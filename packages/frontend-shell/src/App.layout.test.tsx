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
      ],
    },
  }),
}));

const accentStyles = () => Array.from(document.head.querySelectorAll('[data-module-accent]'));

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
    expect(tab.querySelector('[data-logo]')).toHaveAttribute('data-logo', 'JM');
    expect(within(screen.getByTestId('module-sidebar')).getByRole('link', { name: 'History' })).toBeInTheDocument();
  });

  it('highlights the active module tab with the Up blend style, and no other tab', async () => {
    render(<App />);
    expect(await screen.findByText('overview-page')).toBeInTheDocument();
    const tab = within(screen.getByRole('navigation', { name: 'Modules' })).getByRole('link', { name: 'Jobs mod' });
    expect(tab.style.backgroundImage).toContain('radial-gradient(60% 90% at 50% 100%');
    expect(tab.style.backgroundImage).toContain('linear-gradient(0deg');
    expect(within(screen.getByRole('navigation', { name: 'Modules' })).getByRole('link', { name: 'Dashboard' }).style.backgroundImage).toBe('');
  });

  it('shows no A/B test bar: every test is decided', () => {
    render(<App />);
    expect(screen.queryByTestId('ab-dock')).not.toBeInTheDocument();
  });

  it('recolors the accent with the module being viewed, and not on the dashboard', async () => {
    const { unmount } = render(<App />);
    expect(await screen.findByText('overview-page')).toBeInTheDocument();
    expect(accentStyles()).toHaveLength(1);
    unmount();
    expect(accentStyles()).toHaveLength(0);

    window.history.pushState({}, '', '/');
    render(<App />);
    expect(accentStyles()).toHaveLength(0);
  });
});
