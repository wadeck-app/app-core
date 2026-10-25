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
    expect(cellOf('Flow health').style.gridColumn).toMatch(/span 2$/);
    expect(cellOf('Queue depth').style.gridColumn).toMatch(/span 4$/);
  });

  it('takes at least the rows the manifest asks for', () => {
    measuredWidth(1100);
    renderDashboard();
    expect(cellOf('Flow health').style.gridRow).toMatch(/span 2$/);
  });

  it('gives a widget without a size 2 columns and 1 row (it grows with its content)', () => {
    measuredWidth(1100);
    renderDashboard();
    expect(cellOf('Active flows').style.gridColumn).toMatch(/span 2$/);
    expect(cellOf('Active flows').style.gridRow).toMatch(/span 1$/);
  });

  it('limits a widget to the columns that exist when the grid is narrow', () => {
    measuredWidth(150);
    renderDashboard();
    expect(cellOf('Queue depth').style.gridColumn).toMatch(/span 1$/);
    expect(cellOf('Flow health').style.gridColumn).toMatch(/span 1$/);
    expect(cellOf('Active flows').style.gridColumn).toMatch(/span 1$/);
  });

  it('lays the cells out as a lattice of 100px squares', () => {
    measuredWidth(1100);
    const { container } = renderDashboard();
    const grid = container.querySelector('[style*="grid-template-columns"]') as HTMLElement;
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

// The grip of a widget, and a pointer moving over a grid of 9 columns (jsdom lays nothing out: the grid is 1100px wide and
// starts at the top left of the window, so a cell is 116px from the next one).
const gripOf = (label: string): HTMLElement => screen.getByRole('img', { name: `Drag ${label} to move` });
const titles = (): Array<string | null> => screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'));
const STORED_LAYOUT = 'app-core.dashboard.layout';
const storedLayout = (): Record<string, { col: number; row: number }> => JSON.parse(window.localStorage.getItem(STORED_LAYOUT) ?? '{}');

// Takes hold of the grip at (10, 10) of the widget, then moves so that its top left corner is over the cell (col, row).
function holdOver(label: string, col: number, row: number): void {
  fireEvent.pointerDown(gripOf(label), { clientX: 10, clientY: 10, button: 0, pointerId: 1 });
  moveOver(col, row);
}
function moveOver(col: number, row: number): void {
  fireEvent.pointerMove(window, { clientX: 10 + col * 116, clientY: 10 + row * 116, pointerId: 1 });
}
function release(): void {
  fireEvent.pointerUp(window, { pointerId: 1 });
}
function drag(label: string, col: number, row: number): void {
  holdOver(label, col, row);
  release();
}

describe('Dashboard: placing the widgets', () => {
  beforeEach(() => measuredWidth(1100));

  it('starts with the widgets side by side in their natural order', () => {
    renderDashboard();
    expect(titles()).toEqual(['Flow health', 'Active flows', 'Queue depth']);
    expect(cellOf('Flow health').style.gridColumn).toBe('1 / span 2');
    expect(cellOf('Active flows').style.gridColumn).toBe('3 / span 2');
    expect(cellOf('Queue depth').style.gridColumn).toBe('5 / span 4');
  });

  it('drops a widget on any free cell and remembers it in this browser', () => {
    const first = renderDashboard();
    // Under the 2 high widget on the left: free.
    drag('Active flows', 0, 2);
    expect(cellOf('Active flows').style.gridColumn).toBe('1 / span 2');
    expect(cellOf('Active flows').style.gridRow).toMatch(/^3 /);
    expect(titles()).toEqual(['Flow health', 'Queue depth', 'Active flows']);
    expect(storedLayout()['flow-1']).toEqual({ col: 0, row: 2 });
    // The widgets in the way of nobody stay where they were.
    expect(storedLayout()['queue-0']).toEqual({ col: 4, row: 0 });

    first.unmount();
    renderDashboard();
    expect(cellOf('Active flows').style.gridColumn).toBe('1 / span 2');
  });

  it('pushes down only the widget in the way of the one dropped', () => {
    renderDashboard();
    // Cells 7 and 8 of the first row: the 4 wide widget holds cells 4 to 7.
    drag('Active flows', 7, 0);
    expect(storedLayout()['flow-1']).toEqual({ col: 7, row: 0 });
    expect(storedLayout()['queue-0']).toEqual({ col: 4, row: 1 });
    expect(storedLayout()['flow-0']).toEqual({ col: 0, row: 0 });
  });

  it('leaves a widget in the empty space where it is dropped, without sticking to the widget above', () => {
    renderDashboard();
    drag('Active flows', 5, 2);
    expect(storedLayout()['flow-1']).toEqual({ col: 5, row: 2 });
    expect(cellOf('Active flows').style.gridRow).toMatch(/^3 /);
  });

  it('makes room when dropped on another widget: nothing overlaps and the dropped widget is where it was let go', () => {
    renderDashboard();
    drag('Queue depth', 0, 0);
    expect(storedLayout()['queue-0']).toEqual({ col: 0, row: 0 });
    expect(titles()[0]).toBe('Queue depth');
    const places = Object.values(storedLayout());
    expect(new Set(places.map((p) => `${p.col},${p.row}`)).size).toBe(places.length);
  });

  it('saves nothing while the pointer is held, and the place once it is released', () => {
    renderDashboard();
    holdOver('Active flows', 7, 0);
    expect(window.localStorage.getItem(STORED_LAYOUT)).toBeNull();
    release();
    expect(storedLayout()['flow-1']).toEqual({ col: 7, row: 0 });
  });

  it('gives up with Escape: the widget stays where it was', () => {
    renderDashboard();
    holdOver('Active flows', 7, 0);
    fireEvent.keyDown(window, { key: 'Escape' });
    release();
    expect(window.localStorage.getItem(STORED_LAYOUT)).toBeNull();
    expect(cellOf('Active flows').style.gridColumn).toBe('3 / span 2');
  });

  it('gives back a widget let go outside the grid', () => {
    renderDashboard();
    fireEvent.pointerDown(gripOf('Active flows'), { clientX: 10, clientY: 10, button: 0, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 5000, clientY: 10, pointerId: 1 });
    expect(screen.getByTestId('drop-target')).toHaveAttribute('data-valid', 'false');
    release();
    expect(window.localStorage.getItem(STORED_LAYOUT)).toBeNull();
  });

  it('shows the cells and the target under the held widget, and nothing once it is dropped', () => {
    renderDashboard();
    expect(screen.queryByTestId('drag-guides')).not.toBeInTheDocument();
    holdOver('Active flows', 7, 0);
    expect(screen.getByTestId('drag-guides')).toBeInTheDocument();
    const target = screen.getByTestId('drop-target');
    expect(target).toHaveAttribute('data-valid', 'true');
    expect(target.style.left).toBe(`${7 * 116}px`);
    expect(target.style.width).toBe('216px');
    release();
    expect(screen.queryByTestId('drag-guides')).not.toBeInTheDocument();
    expect(screen.queryByTestId('drop-target')).not.toBeInTheDocument();
  });

  it('moves the widget in the way while the pointer is still held', () => {
    renderDashboard();
    holdOver('Active flows', 7, 0);
    expect(cellOf('Queue depth').style.gridRow).toMatch(/^2 /);
    release();
  });

  it('lets the held widget float above the others, out of the grid flow', () => {
    renderDashboard();
    holdOver('Active flows', 7, 0);
    const held = cellOf('Active flows');
    expect(held.style.position).toBe('absolute');
    expect(held.style.left).toBe(`${7 * 116}px`);
    expect(held.style.width).toBe('216px');
    release();
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

  it('offers the way back to the default layout only once it was changed', () => {
    renderDashboard();
    expect(screen.queryByRole('button', { name: 'Reset layout' })).not.toBeInTheDocument();
    drag('Active flows', 7, 0);
    fireEvent.click(screen.getByRole('button', { name: 'Reset layout' }));
    expect(titles()).toEqual(['Flow health', 'Active flows', 'Queue depth']);
    expect(window.localStorage.getItem(STORED_LAYOUT)).toBe('{}');
    expect(screen.queryByRole('button', { name: 'Reset layout' })).not.toBeInTheDocument();
  });

  it('puts a widget that appeared after the order was saved at the end (the list saved before places existed)', () => {
    window.localStorage.setItem('app-core.dashboard.order', JSON.stringify(['queue-0', 'flow-0']));
    renderDashboard();
    expect(titles()).toEqual(['Queue depth', 'Flow health', 'Active flows']);
  });

  it('ignores a place saved by hand that is not a pair of cells', () => {
    window.localStorage.setItem(STORED_LAYOUT, JSON.stringify({ 'flow-0': { col: 'x', row: 1 }, 'queue-0': { col: 1.5, row: 0 } }));
    renderDashboard();
    expect(titles()).toEqual(['Flow health', 'Active flows', 'Queue depth']);
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
