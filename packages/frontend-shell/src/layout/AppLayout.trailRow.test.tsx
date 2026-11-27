import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HeaderActions } from '@wadeck-app/dsl-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DateSettingsProvider } from '../dates/DateFormatContext.js';
import type { LoadedModuleSummary } from '../types.js';
import { AppLayout } from './AppLayout.js';
import { navModulesFor } from './navModel.js';

const page = (label: string, path: string) => ({ kind: 'page', slot: 'nav', label, path, view: {}, rawYaml: '' });
const modules: LoadedModuleSummary[] = [{ id: 'agents', version: '1.0.0', extensionPoints: [page('Agents Sessions', '/sessions'), page('Agents Home', '/')] }];

function renderAt(withHeader: boolean) {
  return render(
    <MemoryRouter initialEntries={['/modules/agents/sessions']}>
      <DateSettingsProvider>
        <Routes>
          <Route
            path="*"
            element={
              <AppLayout modules={modules} navModules={navModulesFor(modules)}>
                <p>content</p>
                {withHeader ? (
                  <HeaderActions>
                    <h1>Sessions</h1>
                    <span>22 sessions</span>
                    <input aria-label="Search" />
                  </HeaderActions>
                ) : null}
              </AppLayout>
            }
          />
        </Routes>
      </DateSettingsProvider>
    </MemoryRouter>,
  );
}

const trail = () => screen.getByRole('navigation', { name: 'Breadcrumb' });
const row = () => trail().parentElement as HTMLElement;
// The element of the row that holds what the page put in the slot.
const slot = () => screen.getByText('22 sessions').parentElement as HTMLElement;

afterEach(() => vi.restoreAllMocks());

describe('the trail row when a page puts its header in the slot (decided: merged with the trail)', () => {
  it('the header follows the trail closely, no divider, and takes the width left: the title reads as the last crumb', async () => {
    renderAt(true);
    await waitFor(() => expect(within(trail()).queryByText('Sessions')).toBeNull());
    expect(within(trail()).getByText('Agents')).toBeInTheDocument();
    expect(row().querySelector('[data-trail-divider]')).toBeNull();
    expect(slot().className).toMatch(/\bflex-1\b/);
    expect(slot().className).not.toMatch(/\bml-auto\b/);
    expect(row().className).not.toMatch(/flex-wrap/);
    // The trail keeps its own width: the header is the one that gives way.
    expect(trail().className).toMatch(/\bshrink-0\b/);
    expect(trail().className).not.toMatch(/\bflex-1\b/);
  });

  it('a page that puts nothing in the slot is drawn as before (last crumb kept, no divider, no wrap)', () => {
    renderAt(false);
    expect(within(trail()).getByText('Sessions')).toBeInTheDocument();
    expect(row().querySelector('[data-trail-divider]')).toBeNull();
    expect(row().className).not.toMatch(/flex-wrap/);
  });

  it('brings the last crumb back when the page stops using the slot', async () => {
    const view = renderAt(true);
    await waitFor(() => expect(within(trail()).queryByText('Sessions')).toBeNull());
    view.unmount();
    renderAt(false);
    expect(within(trail()).getByText('Sessions')).toBeInTheDocument();
  });

  it('no A/B choice is stored or read any more: a stale "ab.header-row" in this browser changes nothing', async () => {
    window.localStorage.setItem('ab.header-row', 'wrap');
    renderAt(true);
    await waitFor(() => expect(within(trail()).queryByText('Sessions')).toBeNull());
    expect(row().className).not.toMatch(/flex-wrap/);
  });
});
