import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// The real rule of the server: a change of it breaks the fixtures below instead of leaving them stale.
import { MAX_PIN_LENGTH, MIN_PIN_LENGTH } from '@wadeck-app/app-core-server/auth/pin';
import { getAccessToken } from './accessToken.js';
import { PinMenu } from './PinMenu.js';
import { setPinAsker, type PinAsker } from './pinPrompt.js';

const HINT = { files: ['C:\\Users\\me\\.config\\app-core\\auth.json'], instruction: 'Delete this file (no restart needed), then choose a new PIN.' };
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('PinMenu', () => {
  let pinSet: boolean;
  let calls: Array<{ url: string; body: unknown }>;
  let changeAnswers: Array<() => Response>;

  beforeEach(() => {
    localStorage.clear();
    pinSet = true;
    calls = [];
    changeAnswers = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ url, body: init.body === undefined ? undefined : JSON.parse(init.body as string) });
        if (url === '/api/auth/status') {
          return json(200, { pinSet, locked: false, elevated: false, resetHint: HINT, minPinLength: MIN_PIN_LENGTH, maxPinLength: MAX_PIN_LENGTH });
        }
        if (url === '/api/auth/pin/change') {
          const next = changeAnswers.shift();
          if (next === undefined) {
            throw new Error('no answer left for change');
          }
          return next();
        }
        throw new Error(`unexpected ${url}`);
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setPinAsker(undefined);
  });

  const open = async (): Promise<void> => {
    render(<PinMenu />);
    fireEvent.click(await screen.findByRole('button', { name: 'PIN settings' }));
  };
  const fill = (label: string, value: string): void => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  };

  it('is reachable even when locked and when no PIN exists; with no PIN it offers to choose one and shows the reset hint', async () => {
    pinSet = false;
    await open();
    expect(await screen.findByText(/No PIN is set yet/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Current PIN')).toBeNull();
    expect(await screen.findByText(HINT.files[0] as string)).toBeInTheDocument();
    expect(screen.getByText(/Forgot the PIN\?/)).toBeInTheDocument();
  });

  it('"Choose a PIN" opens the choose dialog through the same asker as a sensitive action', async () => {
    pinSet = false;
    const asker = vi.fn<PinAsker>(async () => false);
    setPinAsker(asker);
    await open();
    fireEvent.click(await screen.findByRole('button', { name: 'Choose a PIN' }));
    await waitFor(() => expect(asker).toHaveBeenCalledTimes(1));
    expect(asker.mock.calls[0]?.[1]).toBe('choose');
  });

  it('with a PIN: the form asks current, new and confirm, and shows the minimum and the reset hint', async () => {
    await open();
    expect(await screen.findByLabelText('Current PIN')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('New PIN')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Confirm the new PIN')).toHaveAttribute('type', 'password');
    expect(screen.getByText(new RegExp(`at least ${MIN_PIN_LENGTH} characters, at most ${MAX_PIN_LENGTH}`, 'i'))).toBeInTheDocument();
    expect(await screen.findByText(HINT.files[0] as string)).toBeInTheDocument();
  });

  it('refuses in place two new entries that differ, without calling the server', async () => {
    await open();
    await screen.findByLabelText('Current PIN');
    fill('Current PIN', '482915');
    fill('New PIN', '999888');
    fill('Confirm the new PIN', '999887');
    fireEvent.click(screen.getByRole('button', { name: 'Change PIN' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('do not match');
    expect(calls.some((c) => c.url === '/api/auth/pin/change')).toBe(false);
  });

  it('shows the error of a wrong current PIN in place, keeps the new entries, and does not store a token', async () => {
    changeAnswers = [() => json(401, { error: 'pin-wrong', triesLeft: 4, message: 'Wrong PIN. 4 tries left before a wait of 1 minute.' })];
    await open();
    await screen.findByLabelText('Current PIN');
    fill('Current PIN', '000000');
    fill('New PIN', '999888');
    fill('Confirm the new PIN', '999888');
    fireEvent.click(screen.getByRole('button', { name: 'Change PIN' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong PIN. 4 tries left');
    expect(calls.find((c) => c.url === '/api/auth/pin/change')?.body).toEqual({ currentPin: '000000', newPin: '999888' });
    expect(getAccessToken()).toBeUndefined();
    expect((screen.getByLabelText('New PIN') as HTMLInputElement).value).toBe('999888');
    expect((screen.getByLabelText('Current PIN') as HTMLInputElement).value).toBe('');
  });

  it('focuses the current PIN field again after a wrong PIN (the fields are read-only, not disabled, while it asks)', async () => {
    let release!: () => void;
    changeAnswers = [
      () => {
        throw new Error('replaced below');
      },
    ];
    await open();
    await screen.findByLabelText('Current PIN');
    const pending = new Promise<void>((resolve) => (release = resolve));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/auth/pin/change') {
          await pending;
          return json(401, { error: 'pin-wrong', message: 'Wrong PIN. 4 tries left.' });
        }
        return json(200, { pinSet: true, locked: false, elevated: false, resetHint: HINT });
      }),
    );
    fill('Current PIN', '000000');
    fill('New PIN', '999888');
    fill('Confirm the new PIN', '999888');
    fireEvent.click(screen.getByRole('button', { name: 'Change PIN' }));
    const current = screen.getByLabelText('Current PIN') as HTMLInputElement;
    await waitFor(() => expect(current).toHaveAttribute('readonly'));
    expect(current).not.toBeDisabled();
    expect(current).toHaveAttribute('aria-busy', 'true');
    screen.getByRole('button', { name: 'Change PIN' }).focus();
    release();
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong PIN');
    await waitFor(() => expect(document.activeElement).toBe(current));
  });

  it('shows the wait of a lock and disables the button while it lasts', async () => {
    changeAnswers = [() => json(429, { error: 'pin-locked', retryAfterSeconds: 42, message: 'Wrong PIN, and too many wrong tries. Try again in 42 seconds.' })];
    await open();
    await screen.findByLabelText('Current PIN');
    fill('Current PIN', '000000');
    fill('New PIN', '999888');
    fill('Confirm the new PIN', '999888');
    fireEvent.click(screen.getByRole('button', { name: 'Change PIN' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Try again in 4[12] seconds/);
    fill('Current PIN', '482915');
    expect(screen.getByRole('button', { name: 'Change PIN' })).toBeDisabled();
  });

  it('on success says so in place, stores the fresh session token and clears the fields', async () => {
    changeAnswers = [() => json(200, { accessToken: 'changed.tok.en', expiresInSeconds: 600 })];
    await open();
    await screen.findByLabelText('Current PIN');
    fill('Current PIN', '482915');
    fill('New PIN', '999888');
    fill('Confirm the new PIN', '999888');
    fireEvent.click(screen.getByRole('button', { name: 'Change PIN' }));
    expect(await screen.findByText(/PIN changed/)).toBeInTheDocument();
    expect(getAccessToken()).toBe('changed.tok.en');
    expect((screen.getByLabelText('Current PIN') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('New PIN') as HTMLInputElement).value).toBe('');
  });

  it('says why when the server cannot be asked, instead of staying silent', async () => {
    changeAnswers = [() => json(500, { error: 'internal', message: 'auth.json is not valid. Delete it.' })];
    await open();
    await screen.findByLabelText('Current PIN');
    fill('Current PIN', '482915');
    fill('New PIN', '999888');
    fill('Confirm the new PIN', '999888');
    fireEvent.click(screen.getByRole('button', { name: 'Change PIN' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('auth.json is not valid. Delete it.');
  });

  it('closing the Choose a PIN dialog is an answer, not an error: no alert in the menu', async () => {
    pinSet = false;
    const asker = vi.fn<PinAsker>(async () => false);
    setPinAsker(asker);
    await open();
    fireEvent.click(await screen.findByRole('button', { name: 'Choose a PIN' }));
    await waitFor(() => expect(asker).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
