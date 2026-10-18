import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.js';
import { HIDDEN_TESTS_KEY } from './layout/AbSwitcher.js';
import { TAB_HIGHLIGHT_KEY } from './layout/tabHighlight.js';

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

// Dev server only (vitest runs with import.meta.env.DEV): the active-tab style is the one choice still open.
describe('App: A/B test bar', () => {
  const dock = () => within(screen.getByTestId('ab-dock'));
  const tabRow = () => within(screen.getByRole('group', { name: 'Active tab' }));

  it('offers the two open tests, each with its name on the left, muted and apart from the options', () => {
    render(<App />);
    expect(screen.getAllByRole('group').filter((g) => g.closest('[data-testid="ab-dock"]'))).toHaveLength(2);
    for (const label of ['Sidebar header', 'Active tab']) {
      const group = screen.getByRole('group', { name: label });
      const name = group.parentElement!.firstElementChild!;
      expect(name).toHaveTextContent(label);
      expect(name.className).toContain('text-muted');
      expect(name.className).toContain('border-r');
      expect(within(group).queryByText(label)).not.toBeInTheDocument();
    }
  });

  it('stacks Sidebar header above Active tab', () => {
    render(<App />);
    const order = Array.from(document.querySelectorAll('[data-testid="ab-dock"] [role="group"]')).map((g) => g.getAttribute('aria-label'));
    expect(order).toEqual(['Sidebar header', 'Active tab']);
  });

  it('lists the thirty-two styles on four lines, each with a tooltip that says what it changes', () => {
    render(<App />);
    const buttons = tabRow().getAllByRole('button');
    expect(buttons).toHaveLength(32);
    expect(screen.getByRole('group', { name: 'Active tab' }).style.gridTemplateColumns).toContain('repeat(9,');
    for (const b of buttons) expect(b.getAttribute('title')!.length, b.textContent ?? '').toBeGreaterThan(30);
    expect(buttons.map((b) => b.textContent)).toEqual(
      expect.arrayContaining(['Current', 'Invert', 'Outline', 'Contrast', 'Chip', 'Ghost', 'Gradient', 'Topline', 'Dot']),
    );
  });

  it('applies the chosen style to the tabs and remembers it after a reload', async () => {
    const first = render(<App />);
    expect(await screen.findByText('overview-page')).toBeInTheDocument();
    expect(tabRow().getByRole('button', { name: 'Current' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(tabRow().getByRole('button', { name: 'Contrast' }));
    const tab = within(screen.getByRole('navigation', { name: 'Modules' })).getByRole('link', { name: 'Jobs mod' });
    expect(tab.className).toContain('bg-content');
    first.unmount();

    render(<App />);
    expect(tabRow().getByRole('button', { name: 'Contrast' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('warns and falls back to Current when the stored style is unknown', () => {
    localStorage.setItem(TAB_HIGHLIGHT_KEY, 'zzz');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<App />);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown tab highlight "zzz"'));
    expect(tabRow().getByRole('button', { name: 'Current' })).toHaveAttribute('aria-pressed', 'true');
    warn.mockRestore();
  });

  describe('Sidebar header test', () => {
    const headerRow = () => within(screen.getByRole('group', { name: 'Sidebar header' }));
    const side = () => screen.getByTestId('module-sidebar');

    it('offers Icon + name (reference), Name, Icon and None, each with a tooltip', () => {
      render(<App />);
      const buttons = headerRow().getAllByRole('button');
      expect(buttons.map((b) => b.textContent)).toEqual(['Icon + name', 'Name', 'Icon', 'None']);
      expect(headerRow().getByRole('button', { name: 'Icon + name' })).toHaveAttribute('aria-pressed', 'true');
      for (const b of buttons) expect(b.getAttribute('title')!.length, b.textContent ?? '').toBeGreaterThan(30);
    });

    it('applies the chosen mode to the sidebar and remembers it after a reload', async () => {
      const first = render(<App />);
      expect(await screen.findByText('overview-page')).toBeInTheDocument();
      expect(side().querySelector('[data-logo]')).not.toBeNull();

      fireEvent.click(headerRow().getByRole('button', { name: 'Name' }));
      expect(side()).toHaveAttribute('data-header', 'name');
      expect(side().querySelector('[data-logo]')).toBeNull();
      expect(within(side()).getByRole('heading', { name: 'Jobs mod' }).className).not.toContain('sr-only');
      first.unmount();

      render(<App />);
      expect(headerRow().getByRole('button', { name: 'Name' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('warns and falls back to Icon + name when the stored mode is unknown', () => {
      localStorage.setItem('shell.sidebarHeader', 'zzz');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      render(<App />);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown sidebar header "zzz"'));
      expect(headerRow().getByRole('button', { name: 'Icon + name' })).toHaveAttribute('aria-pressed', 'true');
      warn.mockRestore();
    });
  });

  describe('hiding the row', () => {
    it('hides it and leaves a reminder chip with the current choice, which stays applied', async () => {
      localStorage.setItem(TAB_HIGHLIGHT_KEY, 'contrast');
      render(<App />);
      expect(await screen.findByText('overview-page')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Hide Active tab' }));
      expect(screen.queryByRole('group', { name: 'Active tab' })).not.toBeInTheDocument();
      const chip = dock().getByRole('button', { name: 'Show Active tab' });
      expect(chip).toHaveTextContent('Active tab: Contrast');
      // Hidden is not reset: the Contrast style is still the one rendered.
      expect(within(screen.getByRole('navigation', { name: 'Modules' })).getByRole('link', { name: 'Jobs mod' }).className).toContain('bg-content');

      fireEvent.click(chip);
      expect(screen.getByRole('group', { name: 'Active tab' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Show Active tab' })).not.toBeInTheDocument();
    });

    it('remembers a hidden row after a reload', () => {
      const first = render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Hide Active tab' }));
      first.unmount();

      render(<App />);
      expect(screen.queryByRole('group', { name: 'Active tab' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Show Active tab' })).toHaveTextContent('Active tab: Current');
    });

    it('reports an invalid stored value instead of silently ignoring it, and hides nothing', () => {
      localStorage.setItem(HIDDEN_TESTS_KEY, '{not json');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      render(<App />);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(HIDDEN_TESTS_KEY));
      expect(screen.getByRole('group', { name: 'Active tab' })).toBeInTheDocument();
      warn.mockRestore();
    });
  });
});
