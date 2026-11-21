import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@wadeck-app/dsl-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccessToken, storeAccessToken } from './accessToken.js';
import { LockControl } from './LockControl.js';

describe('LockControl', () => {
  let calls: string[];
  let status: { elevated: boolean } | 'fail';

  beforeEach(() => {
    localStorage.clear();
    calls = [];
    status = { elevated: false };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push(`${init.method ?? 'GET'} ${url}`);
        if (url === '/api/auth/status') {
          if (status === 'fail') {
            return new Response('down', { status: 502 });
          }
          return new Response(JSON.stringify({ pinSet: true, locked: false, ...status }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response(null, { status: 204 });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const renderControl = () =>
    render(
      <ToastProvider>
        <LockControl />
      </ToastProvider>,
    );

  it('is hidden when the server says not elevated and no token is stored', async () => {
    renderControl();
    await waitFor(() => expect(calls).toContain('GET /api/auth/status'));
    expect(screen.queryByRole('button', { name: 'Lock sensitive actions' })).toBeNull();
  });

  it('keeps the PIN settings button reachable while locked (no lock button then)', async () => {
    renderControl();
    expect(await screen.findByRole('button', { name: 'PIN settings' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lock sensitive actions' })).toBeNull();
  });

  it('is shown when the server says a refresh cookie is live', async () => {
    status = { elevated: true };
    renderControl();
    expect(await screen.findByRole('button', { name: 'Lock sensitive actions' })).toBeInTheDocument();
  });

  it('is shown at once when a token is stored, and appears when one is stored later', async () => {
    renderControl();
    await waitFor(() => expect(calls).toContain('GET /api/auth/status'));
    expect(screen.queryByRole('button', { name: 'Lock sensitive actions' })).toBeNull();
    storeAccessToken('t.o.k', 600);
    expect(await screen.findByRole('button', { name: 'Lock sensitive actions' })).toBeInTheDocument();
  });

  it('locks: POST logout, token removed, a toast says so, the control disappears', async () => {
    storeAccessToken('t.o.k', 600);
    renderControl();
    fireEvent.click(await screen.findByRole('button', { name: 'Lock sensitive actions' }));
    await waitFor(() => expect(calls).toContain('POST /api/auth/logout'));
    expect(await screen.findByText(/locked/i)).toBeInTheDocument();
    expect(getAccessToken()).toBeUndefined();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Lock sensitive actions' })).toBeNull());
  });

  it('keeps the token and says why when the logout fails', async () => {
    storeAccessToken('t.o.k', 600);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'auth-sessions.json is not valid. Delete it.' }), { status: 500, headers: { 'content-type': 'application/json' } })));
    renderControl();
    fireEvent.click(await screen.findByRole('button', { name: 'Lock sensitive actions' }));
    expect(await screen.findByText(/auth-sessions\.json is not valid/)).toBeInTheDocument();
    expect(getAccessToken()).toBe('t.o.k');
  });

  it('says in the console why it cannot tell, when the status route fails, and stays hidden without a token', async () => {
    status = 'fail';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderControl();
    await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining('/api/auth/status')));
    expect(screen.queryByRole('button', { name: 'Lock sensitive actions' })).toBeNull();
    warn.mockRestore();
  });
});
