import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DateSettingsProvider } from '../dates/DateFormatContext.js';
import type { LoadedModuleSummary } from '../types.js';
import { AppLayout } from './AppLayout.js';
import { navModulesFor } from './navModel.js';

const page = (label: string, path: string, extra: Record<string, unknown> = {}) => ({ kind: 'page', slot: 'nav', label, path, view: {}, rawYaml: '', ...extra });

const modules: LoadedModuleSummary[] = [
  { id: 'agents', version: '1.0.0', extensionPoints: [page('Agents Table', '/table', { navigation: 'collapsible' }), page('Agents Guardrails', '/guardrails', { navigation: 'collapsible' }), page('Agents Home', '/')] },
];

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DateSettingsProvider>
        <Routes>
          <Route
            path="*"
            element={
              <AppLayout modules={modules} navModules={navModulesFor(modules)}>
                <p>content</p>
              </AppLayout>
            }
          />
        </Routes>
      </DateSettingsProvider>
    </MemoryRouter>,
  );
}

const menu = () => screen.queryByRole('navigation', { name: 'Agents pages' });
const hide = () => screen.queryByRole('button', { name: 'Hide navigation' });
const show = () => screen.queryByRole('button', { name: 'Show navigation' });

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('a page that declares a collapsible side menu', () => {
  it('offers "Hide navigation" while the menu is shown, with aria-expanded true', () => {
    renderAt('/modules/agents/table');
    expect(menu()).toBeInTheDocument();
    expect(hide()).toHaveAttribute('aria-expanded', 'true');
    expect(show()).toBeNull();
  });

  it('hides the menu entirely, then "Show navigation" (aria-expanded false) brings it back', () => {
    renderAt('/modules/agents/table');
    fireEvent.click(hide()!);
    expect(menu()).toBeNull();
    expect(show()).toHaveAttribute('aria-expanded', 'false');
    expect(hide()).toBeNull();
    // The page and the trail stay.
    expect(screen.getByText('content')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    fireEvent.click(show()!);
    expect(menu()).toBeInTheDocument();
  });

  it('puts the button before the trail, in the same row, so the trail is shifted by it and nothing overlaps', () => {
    renderAt('/modules/agents/table');
    const toggle = hide()!;
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(toggle.compareDocumentPosition(trail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toggle.parentElement).toBe(trail.parentElement);
  });

  it('remembers the choice in this browser, per page: a remount keeps it, another collapsible page has its own', () => {
    const first = renderAt('/modules/agents/table');
    fireEvent.click(hide()!);
    first.unmount();
    const second = renderAt('/modules/agents/table');
    expect(menu()).toBeNull();
    second.unmount();
    renderAt('/modules/agents/guardrails');
    expect(menu()).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('app-core.menu-collapsed') ?? '{}')).toEqual({ 'agents/table': true });
  });

  it('keeps the hidden state out of a page that does not declare it: the menu is there and there is no button', () => {
    window.localStorage.setItem('app-core.menu-collapsed', JSON.stringify({ 'agents/': true }));
    renderAt('/modules/agents');
    expect(menu()).toBeInTheDocument();
    expect(hide()).toBeNull();
    expect(show()).toBeNull();
  });

  it('says in the console why a stored choice is ignored (not JSON), and shows the menu', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    window.localStorage.setItem('app-core.menu-collapsed', '{oops');
    renderAt('/modules/agents/table');
    expect(menu()).toBeInTheDocument();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('app-core.menu-collapsed'));
  });

  it('follows another tab: a change of the stored choice there hides or shows the menu here', () => {
    renderAt('/modules/agents/table');
    window.localStorage.setItem('app-core.menu-collapsed', JSON.stringify({ 'agents/table': true }));
    fireEvent(window, new StorageEvent('storage', { key: 'app-core.menu-collapsed' }));
    expect(menu()).toBeNull();
    window.localStorage.removeItem('app-core.menu-collapsed');
    fireEvent(window, new StorageEvent('storage', { key: 'app-core.menu-collapsed' }));
    expect(menu()).toBeInTheDocument();
  });

  it('keeps the keyboard focus on the button it pressed', () => {
    renderAt('/modules/agents/table');
    hide()!.focus();
    fireEvent.click(hide()!);
    expect(document.activeElement).toBe(show());
    expect(within(document.body).getByRole('button', { name: 'Show navigation' })).toBeInTheDocument();
  });
});
