import { createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@wadeck-app/dsl-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from './Dashboard.js';
import type { LoadedModuleSummary } from './types.js';

const widget = (label: string, extra: Record<string, unknown> = {}) => ({
  kind: 'widget',
  slot: 'dashboard',
  label,
  view: {},
  rawYaml: `$type: Badge\nlabel: ${label.replace(/\s/g, '-')}-body\n`,
  ...extra,
});
const page = { kind: 'page', slot: 'nav', label: 'Home', path: '/', view: {}, rawYaml: '$type: Badge\nlabel: home\n' };

const modules: LoadedModuleSummary[] = [
  { id: 'flow', version: '1.0.0', extensionPoints: [page, widget('Flow health', { width: 2, height: 2 }), widget('Active flows')] },
  { id: 'queue', version: '1.0.0', title: 'Message queue', extensionPoints: [widget('Queue depth', { width: 4 })] },
];

function renderDashboard() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <Dashboard modules={modules} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

// The element that sizes a widget in the grid: the parent of its frame.
const cellOf = (label: string): HTMLElement => screen.getByRole('heading', { name: label }).closest('section')!.parentElement!;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// jsdom has no layout: the width the grid is measured at is given here. Cells are 100px with gaps of 16px: 1100px makes 9
// columns, 150px makes 1.
function measuredWidth(width: number): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width, height: 0, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 0, toJSON: () => ({}) });
}

describe('Dashboard: widget size from the manifest, in cells of 100px', () => {
  it('spans the columns the manifest asks for', () => {
    measuredWidth(1100);
    renderDashboard();
    expect(cellOf('Flow health').style.gridColumn).toBe('span 2');
    expect(cellOf('Queue depth').style.gridColumn).toBe('span 4');
  });

  it('takes at least the rows the manifest asks for', () => {
    measuredWidth(1100);
    renderDashboard();
    expect(cellOf('Flow health').style.gridRow).toBe('span 2');
  });

  it('gives a widget without a size 2 columns and 1 row (it grows with its content)', () => {
    measuredWidth(1100);
    renderDashboard();
    expect(cellOf('Active flows').style.gridColumn).toBe('span 2');
    expect(cellOf('Active flows').style.gridRow).toBe('span 1');
  });

  it('limits a widget to the columns that exist when the grid is narrow', () => {
    measuredWidth(150);
    renderDashboard();
    expect(cellOf('Queue depth').style.gridColumn).toBe('span 1');
    expect(cellOf('Flow health').style.gridColumn).toBe('span 1');
    expect(cellOf('Active flows').style.gridColumn).toBe('span 1');
  });

  it('lays the cells out as a lattice of 100px squares', () => {
    measuredWidth(1100);
    const { container } = renderDashboard();
    const grid = container.querySelector('.grid-flow-dense') as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('repeat(9, 100px)');
    expect(grid.style.gridAutoRows).toBe('100px');
  });
});

describe('Dashboard: bar', () => {
  it('narrows the widgets to one module and back, with a count per module', () => {
    renderDashboard();
    const filters = within(screen.getByRole('group', { name: 'Show widgets of' }));
    // The module title from the manifest is used, not one derived from the id.
    fireEvent.click(filters.getByRole('button', { name: 'Message queue (1)' }));
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Queue depth']);
    fireEvent.click(filters.getByRole('button', { name: 'All' }));
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });
});

describe('Dashboard: hiding a widget', () => {
  it('hides it from its menu, offers to show it again, and remembers it in this browser', () => {
    const first = renderDashboard();
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Active flows' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hide widget' }));
    expect(screen.queryByRole('article', { name: 'Active flows' })).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('app-core.dashboard.hidden') ?? '[]')).toEqual(['flow-1']);

    // A new page load: still hidden.
    first.unmount();
    renderDashboard();
    expect(screen.queryByRole('article', { name: 'Active flows' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show 1 hidden' }));
    expect(screen.getByRole('article', { name: 'Active flows' })).toBeInTheDocument();
    expect(window.localStorage.getItem('app-core.dashboard.hidden')).toBe('[]');
  });

  it('says so when the saved hidden list is unreadable, and shows every widget', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.localStorage.setItem('app-core.dashboard.hidden', '{not json');
    renderDashboard();
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('cannot read "app-core.dashboard.hidden"'));
  });
});

describe('Dashboard: widget actions', () => {
  it('expands a widget in a dialog named after it', () => {
    renderDashboard();
    fireEvent.click(screen.getByRole('button', { name: 'Expand Flow health' }));
    expect(screen.getByRole('dialog', { name: 'Flow health' })).toBeInTheDocument();
  });

  it('offers to open the module only when it has a page', () => {
    renderDashboard();
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Queue depth' }));
    expect(screen.getByRole('menuitem', { name: 'Open Message queue' })).toBeDisabled();
  });
});

// The grip of a widget and the cell that takes the drop (native HTML drag and drop).
const gripOf = (label: string): HTMLElement => screen.getByRole('img', { name: `Drag ${label} to reorder` });
const titles = (): Array<string | null> => screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'));

function drag(from: string, onto: string): void {
  const dataTransfer = { effectAllowed: '', setData: () => {}, setDragImage: () => {} };
  const target = screen.getByRole('article', { name: onto }).closest('section')!.parentElement!;
  fireEvent(gripOf(from), Object.assign(createEvent.dragStart(gripOf(from)), { dataTransfer }));
  fireEvent.dragOver(target);
  fireEvent.drop(target);
  fireEvent.dragEnd(gripOf(from));
}

describe('Dashboard: order of the widgets', () => {
  it('starts in the natural order', () => {
    renderDashboard();
    expect(titles()).toEqual(['Flow health', 'Active flows', 'Queue depth']);
  });

  it('moves a widget onto another with drag and drop, and remembers it in this browser', () => {
    const first = renderDashboard();
    drag('Queue depth', 'Flow health');
    expect(titles()).toEqual(['Queue depth', 'Flow health', 'Active flows']);
    expect(JSON.parse(window.localStorage.getItem('app-core.dashboard.order') ?? '[]')).toEqual(['queue-0', 'flow-0', 'flow-1']);

    first.unmount();
    renderDashboard();
    expect(titles()).toEqual(['Queue depth', 'Flow health', 'Active flows']);
  });

  it('moves a widget later, then earlier, from its menu (the way without a mouse)', () => {
    renderDashboard();
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Flow health' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move later' }));
    expect(titles()).toEqual(['Active flows', 'Flow health', 'Queue depth']);

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Flow health' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move earlier' }));
    expect(titles()).toEqual(['Flow health', 'Active flows', 'Queue depth']);
  });

  it('cannot move the first widget earlier', () => {
    renderDashboard();
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Flow health' }));
    expect(screen.getByRole('menuitem', { name: 'Move earlier' })).toBeDisabled();
  });

  it('cannot move the last widget later', () => {
    renderDashboard();
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Queue depth' }));
    expect(screen.getByRole('menuitem', { name: 'Move later' })).toBeDisabled();
  });

  it('offers the way back to the default order only once it was changed', () => {
    renderDashboard();
    expect(screen.queryByRole('button', { name: 'Reset order' })).not.toBeInTheDocument();
    drag('Queue depth', 'Flow health');
    fireEvent.click(screen.getByRole('button', { name: 'Reset order' }));
    expect(titles()).toEqual(['Flow health', 'Active flows', 'Queue depth']);
    expect(window.localStorage.getItem('app-core.dashboard.order')).toBe('[]');
  });

  it('puts a widget that appeared after the order was saved at the end', () => {
    window.localStorage.setItem('app-core.dashboard.order', JSON.stringify(['queue-0', 'flow-0']));
    renderDashboard();
    expect(titles()).toEqual(['Queue depth', 'Flow health', 'Active flows']);
  });

  it('ignores a drop on the widget itself', () => {
    renderDashboard();
    drag('Flow health', 'Flow health');
    expect(window.localStorage.getItem('app-core.dashboard.order')).toBeNull();
  });
});

describe('Dashboard: bar', () => {
  it('stays at the top of the page while the widgets scroll under it', () => {
    renderDashboard();
    expect(screen.getByRole('toolbar', { name: 'Dashboard controls' }).className).toContain('sticky');
  });

  it('has no line under it: a solid background is enough to hide what scrolls beneath', () => {
    renderDashboard();
    expect(screen.getByRole('toolbar', { name: 'Dashboard controls' }).className).not.toMatch(/\bborder/);
  });

  it('writes the number of widgets of each module in parentheses, after a space', () => {
    renderDashboard();
    const filters = within(screen.getByRole('group', { name: 'Show widgets of' }));
    expect(filters.getAllByRole('button').map((b) => b.textContent)).toEqual(['All', 'Flow (2)', 'Message queue (1)']);
  });

  it('marks the module the dashboard is narrowed to', () => {
    renderDashboard();
    const filters = within(screen.getByRole('group', { name: 'Show widgets of' }));
    fireEvent.click(filters.getByRole('button', { name: 'Flow (2)' }));
    expect(filters.getByRole('button', { name: 'Flow (2)' })).toHaveAttribute('aria-pressed', 'true');
    expect(filters.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  });
});
