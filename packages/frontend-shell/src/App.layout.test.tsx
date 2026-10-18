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

  const switcher = () => within(screen.getByRole('group', { name: 'Layout' }));

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
    const panel = screen.getByRole('group', { name: 'Layout' });
    const classes = panel.className;
    const cells = within(panel).getAllByRole('button').map((b) => b.textContent);
    expect(cells).toEqual(['Classic', 'A', 'B', 'C', 'D', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7']);
    expect(within(panel).queryByTestId('layout-description')).not.toBeInTheDocument();
    expect(screen.getByTestId('layout-description')).toHaveTextContent('Classic');

    fireEvent.click(within(panel).getByRole('button', { name: 'D3' }));
    expect(await screen.findByText('overview-page')).toBeInTheDocument();
    const same = screen.getByRole('group', { name: 'Layout' });
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
    const accent = () => within(screen.getByRole('group', { name: 'Module accent' }));
    expect(accent().getByRole('button', { name: 'On' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(accent().getByRole('button', { name: 'Off' }));
    expect(accent().getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true');
    expect(accentStyles()).toHaveLength(0);
    first.unmount();

    render(<App />);
    expect(accent().getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('puts the name of every A/B test on the left of its row, muted and apart from the options', () => {
    render(<App />);
    for (const label of ['Logo font', 'Active tab', 'Module accent', 'Layout']) {
      const group = screen.getByRole('group', { name: label });
      const row = group.parentElement!;
      const name = row.firstElementChild!;
      expect(name).toHaveTextContent(label);
      // Label column: muted text with a divider; it is a sibling of the options, not one of them.
      expect(name.className).toContain('text-muted');
      expect(name.className).toContain('border-r');
      expect(within(group).queryByText(label)).not.toBeInTheDocument();
      // Every row has the same width, so the labels line up.
      expect(row.className).toContain('w-[46rem]');
    }
  });

  it('explains every option of every A/B row in a tooltip', () => {
    render(<App />);
    for (const label of ['Logo font', 'Active tab', 'Module accent', 'Layout']) {
      for (const button of within(screen.getByRole('group', { name: label })).getAllByRole('button')) {
        // A tooltip that says something: longer than the button name itself.
        expect(button.getAttribute('title'), `${label} / ${button.textContent}`).toBeTruthy();
        expect(button.getAttribute('title')!.length, `${label} / ${button.textContent}`).toBeGreaterThan(20);
      }
    }
    const optical = within(screen.getByRole('group', { name: 'Logo font' })).getByRole('button', { name: 'Optical' });
    expect(optical.getAttribute('title')).toMatch(/ink is centered/);
  });

  describe('hiding a test row', () => {
    it('hides a row and leaves a reminder chip that shows its choice, which stays applied', async () => {
      localStorage.setItem(LAYOUT_VARIANT_KEY, 'd7');
      localStorage.setItem('shell.logoFont', 'cells');
      render(<App />);
      expect(await screen.findByText('overview-page')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Hide Logo font' }));
      expect(screen.queryByRole('group', { name: 'Logo font' })).not.toBeInTheDocument();
      const chip = screen.getByRole('button', { name: 'Show Logo font' });
      expect(chip).toHaveTextContent('Logo font: Cells');
      // Hidden is not reset: the Cells font is still the one rendered.
      expect(screen.getByTestId('module-sidebar').querySelectorAll('.w-\\[0\\.72em\\]')).toHaveLength(2);

      fireEvent.click(chip);
      expect(screen.getByRole('group', { name: 'Logo font' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Show Logo font' })).not.toBeInTheDocument();
    });

    it('remembers hidden rows after a reload', () => {
      const first = render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Hide Active tab' }));
      fireEvent.click(screen.getByRole('button', { name: 'Hide Module accent' }));
      first.unmount();

      render(<App />);
      expect(screen.queryByRole('group', { name: 'Active tab' })).not.toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Module accent' })).not.toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Logo font' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Show Active tab' })).toHaveTextContent('Active tab: Current');
      expect(screen.getByRole('button', { name: 'Show Module accent' })).toHaveTextContent('Module accent: On');
    });

    it('never offers to hide the Layout row: it is the fixed anchor', () => {
      render(<App />);
      expect(screen.queryByRole('button', { name: 'Hide Layout' })).not.toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Layout' })).toBeInTheDocument();
    });

    it('reports an invalid stored value instead of silently ignoring it', () => {
      localStorage.setItem('shell.abHidden', '{not json');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      render(<App />);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('shell.abHidden'));
      // Nothing hidden by mistake.
      expect(screen.getByRole('group', { name: 'Logo font' })).toBeInTheDocument();
      warn.mockRestore();
    });
  });

  it('stacks the extra tests above the layout row: font, tab, accent, then layout', () => {
    render(<App />);
    const order = Array.from(document.querySelectorAll('[role="group"][aria-label]')).map((g) => g.getAttribute('aria-label'));
    expect(order.filter((l) => ['Logo font', 'Active tab', 'Module accent', 'Layout'].includes(l!))).toEqual(['Logo font', 'Active tab', 'Module accent', 'Layout']);
  });

  it('changes the logo font from the Logo font row and remembers it', async () => {
    localStorage.setItem(LAYOUT_VARIANT_KEY, 'd7');
    const first = render(<App />);
    expect(await screen.findByText('overview-page')).toBeInTheDocument();
    const fonts = () => within(screen.getByRole('group', { name: 'Logo font' }));
    expect(fonts().getAllByRole('button').map((b) => b.textContent)).toEqual(['Inter', 'Optical', 'Mono', 'Cells', 'Serif']);

    fireEvent.click(fonts().getByRole('button', { name: 'Cells' }));
    const logo = screen.getByTestId('module-sidebar').querySelector('[data-logo]')!;
    // Cells: every letter in its own equal-width cell.
    expect(logo.querySelectorAll('.w-\\[0\\.72em\\]')).toHaveLength(2);
    first.unmount();

    render(<App />);
    expect(fonts().getByRole('button', { name: 'Cells' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers the active-tab styles above the panel, applies the chosen one and remembers it', async () => {
    localStorage.setItem(LAYOUT_VARIANT_KEY, 'd7');
    const first = render(<App />);
    expect(await screen.findByText('overview-page')).toBeInTheDocument();
    const styles = within(screen.getByRole('group', { name: 'Active tab' }));
    expect(styles.getByRole('button', { name: 'Current' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(styles.getByRole('button', { name: 'Solid' }));
    const tab = within(screen.getByRole('navigation', { name: 'Modules' })).getByRole('link', { name: 'Jobs mod' });
    expect(tab.className).toContain('bg-primary-solid');
    first.unmount();

    render(<App />);
    expect(within(screen.getByRole('group', { name: 'Active tab' })).getByRole('button', { name: 'Solid' })).toHaveAttribute('aria-pressed', 'true');
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
