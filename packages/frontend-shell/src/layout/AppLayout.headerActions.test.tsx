import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HeaderActions } from '@wadeck-app/dsl-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DateSettingsProvider } from '../dates/DateFormatContext.js';
import type { LoadedModuleSummary } from '../types.js';
import { AppLayout } from './AppLayout.js';
import { navModulesFor } from './navModel.js';

const page = (label: string, path: string, extra: Record<string, unknown> = {}) => ({ kind: 'page', slot: 'nav', label, path, view: {}, rawYaml: '', ...extra });

const modules: LoadedModuleSummary[] = [
  { id: 'machine', version: '1.0.0', extensionPoints: [page('Machine Keys', '/keys', { navigation: 'collapsible' }), page('Machine Home', '/')] },
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
                <HeaderActions>
                  <span>Key unlocked</span>
                </HeaderActions>
              </AppLayout>
            }
          />
        </Routes>
      </DateSettingsProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('the header actions slot of the shell', () => {
  it('shows what a page puts in HeaderActions in the sticky row of the trail, after the trail (right side), with no warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderAt('/modules/machine');
    const chip = screen.getByText('Key unlocked');
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    // Same row as the trail, after it.
    const row = trail.parentElement as HTMLElement;
    expect(row).toContainElement(chip);
    expect(trail.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The row is inside the sticky block under the top bar: the chip stays in view when the page scrolls.
    expect(chip.closest('.sticky')).not.toBeNull();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('is the same on a page with the collapsible menu button: button, trail, then the chip', () => {
    renderAt('/modules/machine/keys');
    const toggle = screen.getByRole('button', { name: 'Hide navigation' });
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const chip = screen.getByText('Key unlocked');
    expect(toggle.compareDocumentPosition(trail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(trail.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toggle.parentElement).toBe(chip.closest('.sticky')?.firstElementChild);
  });

  it('keeps the chip when the menu is hidden', () => {
    window.localStorage.setItem('app-core.menu-collapsed', JSON.stringify({ 'machine/keys': true }));
    renderAt('/modules/machine/keys');
    expect(screen.queryByRole('navigation', { name: 'Machine pages' })).toBeNull();
    expect(screen.getByText('Key unlocked')).toBeInTheDocument();
  });
});
