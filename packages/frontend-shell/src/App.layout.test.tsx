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
    for (const label of ['Top bar', 'Active tab']) {
      const group = screen.getByRole('group', { name: label });
      const name = group.parentElement!.firstElementChild!;
      expect(name).toHaveTextContent(label);
      expect(name.className).toContain('text-muted');
      expect(name.className).toContain('border-r');
      expect(within(group).queryByText(label)).not.toBeInTheDocument();
    }
  });

  it('stacks Top bar above Active tab', () => {
    render(<App />);
    const order = Array.from(document.querySelectorAll('[data-testid="ab-dock"] [role="group"]')).map((g) => g.getAttribute('aria-label'));
    expect(order).toEqual(['Top bar', 'Active tab']);
  });

  describe('Top bar test', () => {
    const barRow = () => within(screen.getByRole('group', { name: 'Top bar' }));
    const header = () => screen.getByRole('banner');

    it('offers seven heights and styles, the current one first, each with a tooltip', () => {
      render(<App />);
      const buttons = barRow().getAllByRole('button');
      expect(buttons.map((b) => b.textContent)).toEqual(['Current', 'Cozy', 'Compact', 'Slim', 'Dense', 'Compact flat', 'Compact blend']);
      expect(barRow().getByRole('button', { name: 'Current' })).toHaveAttribute('aria-pressed', 'true');
      for (const b of buttons) expect(b.getAttribute('title')!.length, b.textContent ?? '').toBeGreaterThan(20);
    });

    it('applies the chosen height to the bar and remembers it after a reload', () => {
      const first = render(<App />);
      expect(header().className).toContain('h-[61px]');
      fireEvent.click(barRow().getByRole('button', { name: 'Compact' }));
      expect(header().className).toContain('h-[45px]');
      expect(header().className).not.toContain('h-[61px]');
      first.unmount();

      render(<App />);
      expect(barRow().getByRole('button', { name: 'Compact' })).toHaveAttribute('aria-pressed', 'true');
      expect(header().className).toContain('h-[45px]');
    });

    it('warns and falls back to Current when the stored option is unknown', () => {
      localStorage.setItem('shell.topBar', 'zzz');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      render(<App />);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown top bar "zzz"'));
      expect(barRow().getByRole('button', { name: 'Current' })).toHaveAttribute('aria-pressed', 'true');
      warn.mockRestore();
    });
  });

  it('no longer offers the decided tests (sidebar header, layout, logo font, module accent)', () => {
    render(<App />);
    for (const label of ['Sidebar header', 'Layout', 'Logo font', 'Module accent']) {
      expect(screen.queryByRole('group', { name: label }), label).not.toBeInTheDocument();
    }
  });

  it('lists the forty-one styles, each with a tooltip that says what it changes, with the steps from Up soft to Up glow in order', () => {
    render(<App />);
    const buttons = tabRow().getAllByRole('button');
    expect(buttons).toHaveLength(41);
    const labels = buttons.map((b) => b.textContent);
    const from = labels.indexOf('Up soft');
    expect(labels.slice(from, from + 7)).toEqual(['Up soft', 'Up blend', 'Glow soft', 'Glow line', 'Glow tall', 'Glow wide', 'Up glow']);
    expect(screen.getByRole('group', { name: 'Active tab' }).style.gridTemplateColumns).toContain('repeat(10,');
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
