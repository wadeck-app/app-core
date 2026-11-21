import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DateSettingsProvider } from '../dates/DateFormatContext.js';
import { TopBarActions } from './TopBarActions.js';

const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

// A tooltip (the native title of the button) on top of the panel it announces is a second thing to read: it goes while the popover is open.
describe('the popover buttons of the top bar show no tooltip while their popover is open', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/app-update') {
          return json({ state: 'update-available', running: null, installed: '1.0.0', latest: '2.0.0', status: null, previousVersion: null, canRestart: false });
        }
        if (url === '/api/auth/status') {
          return json({ pinSet: true, locked: false, elevated: false });
        }
        throw new Error(`unexpected ${url}`);
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const bar = () =>
    render(
      <MemoryRouter>
        <DateSettingsProvider>
          <TopBarActions modules={[]} />
        </DateSettingsProvider>
      </MemoryRouter>,
    );

  it.each([
    ['app-core update', 'Updates: 2.0.0 is available'],
    ['PIN settings', 'PIN settings'],
    ['Theme', 'Theme'],
    ['Versions', 'Versions'],
  ])('%s: tooltip "%s" while closed, none while open, back once closed', async (name, tooltip) => {
    bar();
    const button = await screen.findByRole('button', { name });
    expect(button).toHaveAttribute('title', tooltip);
    fireEvent.click(button);
    await screen.findByTestId('popover-content');
    expect(button).not.toHaveAttribute('title');
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('popover-content')).toBeNull());
    expect(button).toHaveAttribute('title', tooltip);
  });
});
