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

// Opening a second popover while another is open: the first closes, the second opens and STAYS open (a click on a trigger is also an
// outside click for the other popover; the two must not toggle each other).
describe('two popovers of the top bar', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/app-update') {
          return json({ state: 'up-to-date', running: '1.0.0', installed: '1.0.0', latest: '1.0.0', status: null, previousVersion: null, canRestart: false });
        }
        if (url === '/api/auth/status') {
          return json({ pinSet: true, locked: false, elevated: false });
        }
        throw new Error(`unexpected ${url}`);
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  // What a pointer does: press, release, click.
  const press = (el: HTMLElement): void => {
    fireEvent.pointerDown(el);
    fireEvent.mouseDown(el);
    fireEvent.pointerUp(el);
    fireEvent.mouseUp(el);
    fireEvent.click(el);
  };

  it('with the Theme popover open, a click on Versions opens Versions and closes Theme, and Versions stays open', async () => {
    render(
      <MemoryRouter>
        <DateSettingsProvider>
          <TopBarActions modules={[]} />
        </DateSettingsProvider>
      </MemoryRouter>,
    );
    press(await screen.findByRole('button', { name: 'Theme' }));
    await screen.findByTestId('popover-content');
    press(screen.getByRole('button', { name: 'Versions' }));
    await waitFor(() => expect(screen.getAllByTestId('popover-content')).toHaveLength(1));
    // Still there after the events and effects of the click have settled.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getAllByTestId('popover-content')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Versions' })).not.toHaveAttribute('title');
    expect(screen.getByRole('button', { name: 'Theme' })).toHaveAttribute('title', 'Theme');
  });

  it('the same from Versions to Theme', async () => {
    render(
      <MemoryRouter>
        <DateSettingsProvider>
          <TopBarActions modules={[]} />
        </DateSettingsProvider>
      </MemoryRouter>,
    );
    press(await screen.findByRole('button', { name: 'Versions' }));
    await screen.findByTestId('popover-content');
    press(screen.getByRole('button', { name: 'Theme' }));
    await waitFor(() => expect(screen.getAllByTestId('popover-content')).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getAllByTestId('popover-content')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Theme' })).not.toHaveAttribute('title');
  });

  it('opening a popover with a bare click (the keyboard) closes the other one: one panel at a time', async () => {
    render(
      <MemoryRouter>
        <DateSettingsProvider>
          <TopBarActions modules={[]} />
        </DateSettingsProvider>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Theme' }));
    await screen.findByTestId('popover-content');
    fireEvent.click(screen.getByRole('button', { name: 'Versions' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Theme' })).toHaveAttribute('aria-expanded', 'false'));
    expect(screen.getAllByTestId('popover-content')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Versions' })).toHaveAttribute('aria-expanded', 'true');
  });
});
