import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.js';
import { LAYOUT_VARIANT_KEY } from './layout/LayoutSwitcher.js';

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

// Dev server only: the switcher A/B tests the navigation layouts on the real pages (vitest runs with import.meta.env.DEV).
describe('App: layout switcher', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/modules/jobs-mod');
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  const switcher = () => within(screen.getByRole('group', { name: 'Layout variants' }));

  it('starts on the classic layout, with the switcher visible on the real page', async () => {
    render(<App />);
    expect(await screen.findByText('overview-page')).toBeInTheDocument();
    expect(switcher().getByRole('button', { name: 'Classic' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('module-sidebar')).not.toBeInTheDocument();
  });

  it('switches to A: module tabs on top, its pages in the sidebar, same page content', async () => {
    render(<App />);
    fireEvent.click(switcher().getByRole('button', { name: 'A' }));
    expect(await screen.findByText('overview-page')).toBeInTheDocument();
    expect(within(screen.getByTestId('module-sidebar')).getByRole('link', { name: 'History' })).toBeInTheDocument();
    expect(localStorage.getItem(LAYOUT_VARIANT_KEY)).toBe('a');
  });

  it('switches to B and remembers the choice after a reload', async () => {
    const first = render(<App />);
    fireEvent.click(switcher().getByRole('button', { name: 'B' }));
    expect(await screen.findByRole('button', { name: 'Jobs mod' })).toHaveAttribute('aria-expanded', 'true');
    first.unmount();

    render(<App />);
    expect(switcher().getByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the panel identical whatever the variant: the description lives outside it', async () => {
    render(<App />);
    const panel = screen.getByRole('group', { name: 'Layout variants' });
    const classes = panel.className;
    const cells = within(panel).getAllByRole('button').map((b) => b.textContent);
    expect(cells).toEqual(['Classic', 'A', 'B', 'C', 'D', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7']);
    expect(within(panel).queryByTestId('layout-description')).not.toBeInTheDocument();
    expect(screen.getByTestId('layout-description')).toHaveTextContent('Classic');

    fireEvent.click(within(panel).getByRole('button', { name: 'D3' }));
    expect(await screen.findByText('overview-page')).toBeInTheDocument();
    const same = screen.getByRole('group', { name: 'Layout variants' });
    expect(same.className).toBe(classes);
    expect(within(same).getAllByRole('button').map((b) => b.textContent)).toEqual(cells);
    expect(screen.getByTestId('layout-description')).toHaveTextContent('D3 - dark + 1-letter logo');
  });

  const accentStyles = () => Array.from(document.head.querySelectorAll('[data-module-accent]'));

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

  it('stops recoloring when the module accent toggle is switched off, and remembers it', async () => {
    const first = render(<App />);
    expect(await screen.findByText('overview-page')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Module accent: on' }));
    expect(screen.getByRole('button', { name: 'Module accent: off' })).toHaveAttribute('aria-pressed', 'false');
    expect(accentStyles()).toHaveLength(0);
    first.unmount();

    render(<App />);
    expect(screen.getByRole('button', { name: 'Module accent: off' })).toBeInTheDocument();
  });

  it('warns and falls back to classic when the stored layout is unknown', () => {
    localStorage.setItem(LAYOUT_VARIANT_KEY, 'zzz');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<App />);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown layout "zzz"'));
    expect(switcher().getByRole('button', { name: 'Classic' })).toHaveAttribute('aria-pressed', 'true');
    warn.mockRestore();
  });
});
