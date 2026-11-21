import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.js';
import { storeAccessToken } from './auth/accessToken.js';
import { askForPin } from './auth/pinPrompt.js';

vi.mock('./useModules.js', () => ({
  useModules: () => ({ error: undefined, data: { modules: [] } }),
}));

describe('App: PIN dialog and the lock control', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });
  afterEach(() => vi.restoreAllMocks());

  it('mounts the PIN dialog: a sensitive action can ask for the PIN anywhere in the app', async () => {
    render(<App />);
    let answer!: Promise<boolean>;
    act(() => {
      answer = askForPin(async () => ({ ok: true }));
    });
    expect(await screen.findByLabelText('PIN')).toHaveAttribute('type', 'password');
    act(() => screen.getByRole('button', { name: 'Cancel' }).click());
    await expect(answer).resolves.toBe(false);
  });

  const stubStatus = (elevated: boolean): void => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => new Response(JSON.stringify(url === '/api/auth/status' ? { pinSet: true, locked: false, elevated } : {}), { status: 200, headers: { 'content-type': 'application/json' } })),
    );
  };

  it('shows "Enter PIN" in the top bar while locked, even with a stale token stored', async () => {
    stubStatus(false);
    storeAccessToken('t.o.k', 600);
    render(<App />);
    const banner = within(screen.getByRole('banner'));
    expect(await banner.findByRole('button', { name: 'Enter PIN' })).toBeInTheDocument();
    expect(banner.queryByText('Sudo')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('shows the Sudo badge with its leave button in the top bar when the server says the session is live', async () => {
    stubStatus(true);
    storeAccessToken('t.o.k', 600);
    render(<App />);
    const banner = within(screen.getByRole('banner'));
    expect(await banner.findByText('Sudo')).toBeInTheDocument();
    expect(banner.getByRole('button', { name: 'Leave sudo mode (lock sensitive actions)' })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
