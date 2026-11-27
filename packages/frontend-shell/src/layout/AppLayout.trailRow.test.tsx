import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HeaderActions } from '@wadeck-app/dsl-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DateSettingsProvider } from '../dates/DateFormatContext.js';
import type { LoadedModuleSummary } from '../types.js';
import { AppLayout } from './AppLayout.js';
import { navModulesFor } from './navModel.js';
import { TRAIL_VARIANTS } from './trailRowVariants.js';

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

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('the trail row when a page puts its header in the slot (A/B "Header row")', () => {
  it('has five variants, and the first one is what the shell did before: nothing changes until the user picks another', () => {
    expect(TRAIL_VARIANTS).toEqual(['right', 'right-title', 'gap', 'merged', 'wrap']);
  });

  it('right (default): the trail keeps its last crumb, the header is pushed to the right end', async () => {
    renderAt(true);
    await waitFor(() => expect(slot()).toBeInTheDocument());
    expect(within(trail()).getByText('Sessions')).toBeInTheDocument();
    expect(slot().className).toMatch(/\bml-auto\b/);
    expect(row().className).not.toMatch(/flex-wrap/);
  });

  it('right-title: the last crumb is dropped (the header shows the title), the header is still at the right end', async () => {
    window.localStorage.setItem('ab.header-row', 'right-title');
    renderAt(true);
    await waitFor(() => expect(within(trail()).queryByText('Sessions')).toBeNull());
    expect(within(trail()).getByText('Agents')).toBeInTheDocument();
    expect(slot().className).toMatch(/\bml-auto\b/);
  });

  it('gap: the header follows the trail after a gap and a divider, takes the width left, and the last crumb is dropped', async () => {
    window.localStorage.setItem('ab.header-row', 'gap');
    renderAt(true);
    await waitFor(() => expect(within(trail()).queryByText('Sessions')).toBeNull());
    expect(row().querySelector('[data-trail-divider]')).not.toBeNull();
    expect(slot().className).toMatch(/\bflex-1\b/);
    expect(slot().className).not.toMatch(/\bml-auto\b/);
  });

  it('merged: the header follows the trail closely, no divider, last crumb dropped: the title reads as the last crumb', async () => {
    window.localStorage.setItem('ab.header-row', 'merged');
    renderAt(true);
    await waitFor(() => expect(within(trail()).queryByText('Sessions')).toBeNull());
    expect(row().querySelector('[data-trail-divider]')).toBeNull();
    expect(slot().className).toMatch(/\bflex-1\b/);
  });

  it('wrap: the header goes under the trail when it does not fit (a row that wraps), last crumb dropped', async () => {
    window.localStorage.setItem('ab.header-row', 'wrap');
    renderAt(true);
    await waitFor(() => expect(within(trail()).queryByText('Sessions')).toBeNull());
    expect(row().className).toMatch(/\bflex-wrap\b/);
    // A line break is decided on natural widths: the trail keeps its own (no flex-1, whose zero basis never wraps and let the header
    // overlap the crumb at 640 px), and the header has a minimum basis it grows from, so it goes under the trail as a whole.
    expect(trail().className).not.toMatch(/\bflex-1\b/);
    expect(trail().className).toMatch(/\bshrink-0\b/);
    expect(slot().className).toMatch(/\bgrow\b/);
    expect(slot().className).toMatch(/\bbasis-96\b/);
  });

  it.each(TRAIL_VARIANTS)('%s: a page that puts nothing in the slot is drawn as before (last crumb kept, no divider, no wrap)', async (variant) => {
    window.localStorage.setItem('ab.header-row', variant);
    renderAt(false);
    expect(within(trail()).getByText('Sessions')).toBeInTheDocument();
    expect(row().querySelector('[data-trail-divider]')).toBeNull();
    expect(row().className).not.toMatch(/flex-wrap/);
  });

  it('brings the last crumb back when the page stops using the slot', async () => {
    window.localStorage.setItem('ab.header-row', 'right-title');
    const view = renderAt(true);
    await waitFor(() => expect(within(trail()).queryByText('Sessions')).toBeNull());
    view.unmount();
    renderAt(false);
    expect(within(trail()).getByText('Sessions')).toBeInTheDocument();
  });

  it('an unknown stored choice falls back to the first variant and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    window.localStorage.setItem('ab.header-row', 'nonsense');
    renderAt(true);
    expect(within(trail()).getByText('Sessions')).toBeInTheDocument();
    expect(warn.mock.calls.flat().join(' ')).toContain('ab.header-row');
  });
});
