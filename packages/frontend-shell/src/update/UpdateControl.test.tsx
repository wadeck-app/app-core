import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateControl, UPDATE_POLL_MS } from './UpdateControl.js';

const OLD = '2026.11.14-193-c7bfd3f7';
const NEW = '2026.11.20-209-2f19765e';

type Answer = Record<string, unknown>;
const answer = (extra: Answer): Answer => ({ state: 'up-to-date', running: OLD, installed: OLD, latest: OLD, status: 'success', previousVersion: null, canRestart: true, ...extra });

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('UpdateControl', () => {
  let calls: string[];
  let current: Answer | 'down';

  beforeEach(() => {
    calls = [];
    current = answer({});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push(`${init.method ?? 'GET'} ${url}`);
        if (current === 'down') {
          return new Response('down', { status: 502 });
        }
        if (url === '/api/app-update/restart') {
          return json({ restarting: true }, 202);
        }
        return json(current);
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const button = () => screen.queryByRole('button', { name: /app-core update/i });

  it('is hidden when running, installed and latest are the same', async () => {
    render(<UpdateControl />);
    await waitFor(() => expect(calls).toContain('GET /api/app-update'));
    expect(button()).toBeNull();
  });

  it('is green with "X is installed, restart to use it" when the installed version is not the running one', async () => {
    current = answer({ state: 'restart-needed', installed: NEW, latest: NEW });
    render(<UpdateControl />);
    const trigger = await screen.findByRole('button', { name: /app-core update/i });
    expect(trigger.innerHTML).toContain('text-success-text');
    fireEvent.click(trigger);
    expect(await screen.findByText(`${NEW} is installed, restart to use it`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restart now' })).toBeInTheDocument();
  });

  it('is orange and gives the message, the step and the log file when the update failed', async () => {
    current = answer({ state: 'update-failed', latest: NEW, status: 'failed', failure: { message: 'module "project" does not load', step: 'staged', logFile: 'C:/cfg/logs/2026-11-20.ndjson' } });
    render(<UpdateControl />);
    const trigger = await screen.findByRole('button', { name: /app-core update/i });
    expect(trigger.innerHTML).toContain('text-warning-text');
    fireEvent.click(trigger);
    expect(await screen.findByText(`The update to ${NEW} failed`)).toBeInTheDocument();
    expect(screen.getByText('module "project" does not load')).toBeInTheDocument();
    expect(screen.getByText('staged')).toBeInTheDocument();
    expect(screen.getByText('C:/cfg/logs/2026-11-20.ndjson')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restart now' })).toBeNull();
  });

  it('is neutral while applying and when an update is available', async () => {
    current = answer({ state: 'applying', latest: NEW, status: 'applying' });
    render(<UpdateControl />);
    fireEvent.click(await screen.findByRole('button', { name: /app-core update/i }));
    expect(await screen.findByText(`Installing ${NEW}...`)).toBeInTheDocument();
  });

  it('says what to do when the update state is unknown (a run from sources)', async () => {
    current = answer({ state: 'unknown', reason: 'not run from an installed app-core-cli', running: null, installed: null, canRestart: false });
    render(<UpdateControl />);
    fireEvent.click(await screen.findByRole('button', { name: /app-core update/i }));
    expect(await screen.findByText('not run from an installed app-core-cli')).toBeInTheDocument();
  });

  it('shows no Restart button when this run cannot restart itself, and says to restart by hand', async () => {
    current = answer({ state: 'restart-needed', installed: NEW, latest: NEW, canRestart: false });
    render(<UpdateControl />);
    fireEvent.click(await screen.findByRole('button', { name: /app-core update/i }));
    expect(await screen.findByText(/restart app-core yourself/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restart now' })).toBeNull();
  });

  it('restarts: POST, waits until the server answers with the new version, then reloads', async () => {
    current = answer({ state: 'restart-needed', installed: NEW, latest: NEW });
    const reload = vi.fn();
    render(<UpdateControl reload={reload} restartPollMs={5} />);
    fireEvent.click(await screen.findByRole('button', { name: /app-core update/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Restart now' }));
    await waitFor(() => expect(calls).toContain('POST /api/app-update/restart'));
    // Still the old server for a moment, then down, then back with the new version.
    current = 'down';
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(reload).not.toHaveBeenCalled();
    current = answer({ running: NEW, installed: NEW, latest: NEW });
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('says why when the restart is refused, and keeps the button', async () => {
    current = answer({ state: 'restart-needed', installed: NEW, latest: NEW });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url === '/api/app-update/restart' ? json({ error: 'pin-not-set', message: 'Run "app-core-cli pin set" to choose the PIN.' }, 403) : json(current))),
    );
    render(<UpdateControl reload={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /app-core update/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Restart now' }));
    expect(await screen.findByText(/app-core-cli pin set/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restart now' })).toBeInTheDocument();
  });

  it('asks again on window focus and every 5 minutes, not more', async () => {
    vi.useFakeTimers();
    render(<UpdateControl />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls.filter((c) => c === 'GET /api/app-update')).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPDATE_POLL_MS - 1);
    });
    expect(calls.filter((c) => c === 'GET /api/app-update')).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(calls.filter((c) => c === 'GET /api/app-update')).toHaveLength(2);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls.filter((c) => c === 'GET /api/app-update')).toHaveLength(3);
    expect(UPDATE_POLL_MS).toBe(5 * 60 * 1000);
  });

  it('says in the console why it cannot tell, and stays hidden, when the route fails', async () => {
    current = 'down';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(<UpdateControl />);
    await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining('/api/app-update')));
    expect(button()).toBeNull();
    warn.mockRestore();
  });
});
