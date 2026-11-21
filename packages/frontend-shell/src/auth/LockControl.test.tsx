import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@wadeck-app/dsl-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_TOKEN_KEY, getAccessToken, storeAccessToken } from './accessToken.js';
import { LockControl } from './LockControl.js';
import { PinPromptHost } from './PinPromptHost.js';
import { setPinAsker } from './pinPrompt.js';

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('LockControl', () => {
  let calls: string[];
  let status: { elevated: boolean; pinSet: boolean } | 'fail';
  // What the server does with a valid PIN: the session becomes live.
  let pinAccepted: string;

  beforeEach(() => {
    localStorage.clear();
    calls = [];
    status = { elevated: false, pinSet: true };
    pinAccepted = '482915';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push(`${init.method ?? 'GET'} ${url}`);
        if (url === '/api/auth/status') {
          if (status === 'fail') {
            return new Response('down', { status: 502 });
          }
          return json(200, { locked: false, ...status });
        }
        if (url === '/api/auth/refresh') {
          return json(401, { error: 'refresh-required', message: 'PIN needed' });
        }
        if (url === '/api/auth/pin') {
          const { pin } = JSON.parse(init.body as string) as { pin: string };
          if (pin !== pinAccepted) {
            return json(401, { error: 'pin-wrong', message: 'Wrong PIN. 4 tries left.' });
          }
          if (status !== 'fail') {
            status = { ...status, elevated: true };
          }
          return json(200, { accessToken: 'new.tok.en', expiresInSeconds: 600 });
        }
        if (url === '/api/auth/logout') {
          if (status !== 'fail') {
            status = { ...status, elevated: false };
          }
          return new Response(null, { status: 204 });
        }
        throw new Error(`unexpected ${url}`);
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setPinAsker(undefined);
  });

  const renderControl = () =>
    render(
      <ToastProvider>
        <PinPromptHost />
        <LockControl />
      </ToastProvider>,
    );
  const enterPinButton = () => screen.queryByRole('button', { name: 'Enter PIN' });
  const leaveButton = () => screen.queryByRole('button', { name: 'Leave sudo mode' });

  it('locked: shows "Enter PIN" and the PIN settings, no Sudo badge, no leave button', async () => {
    renderControl();
    expect(await screen.findByRole('button', { name: 'Enter PIN' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PIN settings' })).toBeInTheDocument();
    await waitFor(() => expect(calls).toContain('GET /api/auth/status'));
    expect(screen.queryByText('Sudo')).toBeNull();
    expect(leaveButton()).toBeNull();
  });

  it('"Enter PIN" opens the unlock dialog straight away; a valid PIN replaces the button with the Sudo badge and its leave button', async () => {
    renderControl();
    fireEvent.click(await screen.findByRole('button', { name: 'Enter PIN' }));
    const field = await screen.findByLabelText('PIN');
    fireEvent.change(field, { target: { value: '482915' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText('Sudo')).toBeInTheDocument();
    expect(leaveButton()).not.toBeNull();
    expect(enterPinButton()).toBeNull();
    expect(getAccessToken()).toBe('new.tok.en');
  });

  it('cancelling the dialog stays locked, without an error toast', async () => {
    renderControl();
    fireEvent.click(await screen.findByRole('button', { name: 'Enter PIN' }));
    await screen.findByLabelText('PIN');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByLabelText('PIN')).toBeNull());
    expect(enterPinButton()).not.toBeNull();
    expect(screen.queryByText(/Could not unlock/)).toBeNull();
  });

  it('with no PIN set, "Enter PIN" opens the Choose a PIN dialog', async () => {
    status = { elevated: false, pinSet: false };
    renderControl();
    fireEvent.click(await screen.findByRole('button', { name: 'Enter PIN' }));
    expect(await screen.findByLabelText('New PIN')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm the PIN')).toBeInTheDocument();
  });

  it('is Sudo at once when the server says a refresh session is live', async () => {
    status = { elevated: true, pinSet: true };
    renderControl();
    expect(await screen.findByText('Sudo')).toBeInTheDocument();
    expect(enterPinButton()).toBeNull();
  });

  it('Sudo and its × are ONE chip with ONE tooltip: the × is a button inside the chip and has no title of its own', async () => {
    status = { elevated: true, pinSet: true };
    renderControl();
    const leave = await screen.findByRole('button', { name: 'Leave sudo mode' });
    const chip = screen.getByText('Sudo');
    expect(chip).toContainElement(leave);
    expect(chip).toHaveAttribute('title', 'Sudo mode: sensitive actions are unlocked until you leave it (x) or the session expires.');
    expect(leave).not.toHaveAttribute('title');
    expect(chip.querySelectorAll('[title]')).toHaveLength(0);
    // The × is visible at rest, at the ink of the chip: no opacity-0 / hover-only reveal.
    expect(leave.className).not.toMatch(/opacity-0|invisible|hidden/);
    expect(leave.querySelector('svg')).not.toBeNull();
  });

  it('the chip is drawn with the danger tokens (text, border, fill, × hover and focus ring), none of the warning ones', async () => {
    status = { elevated: true, pinSet: true };
    renderControl();
    const leave = await screen.findByRole('button', { name: 'Leave sudo mode' });
    const chip = screen.getByText('Sudo');
    for (const token of ['border-danger', 'bg-danger-bg', 'text-danger-text']) {
      expect(chip.className.split(/\s+/)).toContain(token);
    }
    for (const token of ['hover:bg-danger', 'hover:text-on-solid', 'focus-visible:ring-danger-text']) {
      expect(leave.className.split(/\s+/)).toContain(token);
    }
    expect(chip.outerHTML).not.toMatch(/warning/);
  });

  it('a stale token alone is not sudo: the status says elevated:false, so "Enter PIN" stays', async () => {
    storeAccessToken('t.o.k', 600);
    renderControl();
    await waitFor(() => expect(calls).toContain('GET /api/auth/status'));
    expect(await screen.findByRole('button', { name: 'Enter PIN' })).toBeInTheDocument();
    expect(screen.queryByText('Sudo')).toBeNull();
  });

  it('leaves sudo: POST logout, token removed, a toast says so, "Enter PIN" comes back', async () => {
    status = { elevated: true, pinSet: true };
    storeAccessToken('t.o.k', 600);
    renderControl();
    fireEvent.click(await screen.findByRole('button', { name: 'Leave sudo mode' }));
    await waitFor(() => expect(calls).toContain('POST /api/auth/logout'));
    expect(await screen.findByText(/locked/i)).toBeInTheDocument();
    expect(getAccessToken()).toBeUndefined();
    expect(await screen.findByRole('button', { name: 'Enter PIN' })).toBeInTheDocument();
    expect(screen.queryByText('Sudo')).toBeNull();
  });

  it('keeps sudo and the token, and says why, when the logout fails', async () => {
    status = { elevated: true, pinSet: true };
    storeAccessToken('t.o.k', 600);
    const base = fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => (url === '/api/auth/logout' ? json(500, { message: 'auth-sessions.json is not valid. Delete it.' }) : base(url, init))),
    );
    renderControl();
    fireEvent.click(await screen.findByRole('button', { name: 'Leave sudo mode' }));
    expect(await screen.findByText(/auth-sessions\.json is not valid/)).toBeInTheDocument();
    expect(getAccessToken()).toBe('t.o.k');
    expect(screen.getByText('Sudo')).toBeInTheDocument();
  });

  it('follows another tab: a token stored there (storage event) shows Sudo, one removed there brings "Enter PIN" back', async () => {
    renderControl();
    await screen.findByRole('button', { name: 'Enter PIN' });
    status = { elevated: true, pinSet: true };
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: ACCESS_TOKEN_KEY }));
    });
    expect(await screen.findByText('Sudo')).toBeInTheDocument();
    status = { elevated: false, pinSet: true };
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: ACCESS_TOKEN_KEY }));
    });
    expect(await screen.findByRole('button', { name: 'Enter PIN' })).toBeInTheDocument();
  });

  it('ignores the storage events of other keys', async () => {
    renderControl();
    await screen.findByRole('button', { name: 'Enter PIN' });
    const before = calls.filter((c) => c === 'GET /api/auth/status').length;
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }));
    });
    expect(calls.filter((c) => c === 'GET /api/auth/status').length).toBe(before);
  });

  it('asks the status again when the window gets the focus', async () => {
    renderControl();
    await screen.findByRole('button', { name: 'Enter PIN' });
    status = { elevated: true, pinSet: true };
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(await screen.findByText('Sudo')).toBeInTheDocument();
  });

  it('says in the console why it cannot tell, when the status route fails, and never shows Sudo on a guess', async () => {
    status = 'fail';
    storeAccessToken('t.o.k', 600);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderControl();
    await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining('/api/auth/status')));
    expect(screen.queryByText('Sudo')).toBeNull();
    expect(enterPinButton()).not.toBeNull();
    warn.mockRestore();
  });

  it('puts the message of the server (what to repair) in the console when the status route answers it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(500, { error: 'internal', message: 'auth.json is not valid. Delete it, then choose a new PIN.' })));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderControl();
    await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining('auth.json is not valid. Delete it, then choose a new PIN.')));
    warn.mockRestore();
  });
});
