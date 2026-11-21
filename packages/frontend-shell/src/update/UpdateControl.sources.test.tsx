import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateControl } from './UpdateControl.js';

const INSTALLED = '2026.11.14-193-c7bfd3f7';
const LATEST = '2026.11.20-209-2f19765e';
const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

// A run from sources (dev:all): `running` is null, the answer is about the app-core-cli installed on the machine.
describe('UpdateControl in a run from sources', () => {
  let answer: Record<string, unknown>;
  const asked = () => (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter((call) => call[0] === '/api/app-update').length;

  beforeEach(() => {
    answer = { state: 'up-to-date', running: null, installed: INSTALLED, latest: INSTALLED, status: 'success', previousVersion: null, canRestart: false };
    vi.stubGlobal('fetch', vi.fn(async () => json(answer)));
  });
  afterEach(() => vi.unstubAllGlobals());

  const trigger = () => screen.queryByRole('button', { name: /app-core update/i });

  it('renders nothing when up to date', async () => {
    render(<UpdateControl />);
    await waitFor(() => expect(asked()).toBe(1));
    expect(trigger()).toBeNull();
  });

  it('renders nothing when untracked (no installed app-core-cli to look at): not a negative icon', async () => {
    answer = { state: 'untracked', reason: 'APP_CORE_INSTALLED_CLI_DIR is not set', running: null, installed: null, latest: null, status: null, previousVersion: null, canRestart: false };
    render(<UpdateControl />);
    await waitFor(() => expect(asked()).toBe(1));
    expect(trigger()).toBeNull();
  });

  it('says what to do when a newer app-core-cli is available, with a download icon and no Restart button', async () => {
    answer = { ...answer, state: 'update-available', latest: LATEST };
    render(<UpdateControl />);
    const button = await screen.findByRole('button', { name: /app-core update/i });
    expect(button.querySelector('svg')?.getAttribute('class')).toContain('lucide-download');
    expect(button).toHaveAttribute('title', `Updates: ${LATEST} is available`);
    fireEvent.click(button);
    expect(await screen.findByText(`app-core-cli ${LATEST} is available (installed: ${INSTALLED}). It installs itself at the next start of any app-core-cli command, or run: app-core-cli update`)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Restart/ })).toBeNull();
  });

  it('shows the failure of the updater, and says the installed version stays (nothing "keeps running")', async () => {
    answer = { ...answer, state: 'update-failed', latest: LATEST, failure: { message: 'health check failed', step: 'staged' } };
    render(<UpdateControl />);
    fireEvent.click(await screen.findByRole('button', { name: /app-core update/i }));
    expect(await screen.findByText('health check failed')).toBeInTheDocument();
    expect(screen.getByText(`${INSTALLED} stays installed. The updater tries again at its next check.`)).toBeInTheDocument();
  });

  it('still shows a REAL problem (unknown) with its reason', async () => {
    answer = { ...answer, state: 'unknown', reason: '/x/update-state.json is not valid JSON', installed: null, latest: null };
    render(<UpdateControl />);
    fireEvent.click(await screen.findByRole('button', { name: /app-core update/i }));
    expect(await screen.findByText('/x/update-state.json is not valid JSON')).toBeInTheDocument();
  });
});
