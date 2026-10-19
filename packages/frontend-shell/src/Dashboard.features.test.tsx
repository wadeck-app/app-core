import { fireEvent, render, screen, within } from '@testing-library/react';
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
  // The frame variant that has the tools (the A/B test choice is kept under ab.<id>).
  window.localStorage.setItem('ab.widget-frame', 'jira-tools');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Dashboard: widget size from the manifest', () => {
  it('spans the columns and keeps the minimum height the manifest asks for', () => {
    renderDashboard();
    expect(cellOf('Flow health').className).toContain('lg:col-span-2');
    // 2 cells of 9rem and the 1rem gap between them (jsdom adds the terms up: 2 * 9 + 1 = 19).
    expect(cellOf('Flow health').style.minHeight).toBe('calc(19rem)');
    expect(cellOf('Queue depth').className).toContain('xl:col-span-4');
  });

  it('gives a widget without a size one column and the height of its content', () => {
    renderDashboard();
    expect(cellOf('Active flows').className).not.toContain('col-span');
    expect(cellOf('Active flows').style.minHeight).toBe('');
  });
});

describe('Dashboard: bar', () => {
  it('narrows the widgets to one module and back, with a count per module', () => {
    renderDashboard();
    const filters = within(screen.getByRole('group', { name: 'Show widgets of' }));
    // The module title from the manifest is used, not one derived from the id.
    fireEvent.click(filters.getByRole('button', { name: 'Message queue 1' }));
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
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('cannot read the hidden widgets'));
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
