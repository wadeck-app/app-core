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

  it('shows the lock control in the top bar when an access token is stored', async () => {
    storeAccessToken('t.o.k', 600);
    render(<App />);
    expect(await within(screen.getByRole('banner')).findByRole('button', { name: 'Lock sensitive actions' })).toBeInTheDocument();
  });
});
