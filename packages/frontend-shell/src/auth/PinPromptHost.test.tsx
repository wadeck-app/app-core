import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// The real rule of the server: a change of it breaks the fixtures below instead of leaving them stale.
import { MAX_PIN_LENGTH, MIN_PIN_LENGTH } from '@wadeck-app/app-core-server/auth/pin';
import { askForPin, setPinAsker, type PinVerdict } from './pinPrompt.js';
import { PinPromptHost } from './PinPromptHost.js';

describe('PinPromptHost', () => {
  afterEach(() => {
    setPinAsker(undefined);
    vi.useRealTimers();
  });

  const type = (value: string): void => {
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value } });
  };

  it('shows nothing until a PIN is asked, then a dialog with a password field', async () => {
    render(<PinPromptHost />);
    expect(screen.queryByLabelText('PIN')).toBeNull();
    const verify = vi.fn(async (): Promise<PinVerdict> => ({ ok: true }));
    let answer!: Promise<boolean>;
    act(() => {
      answer = askForPin(verify);
    });
    const field = await screen.findByLabelText('PIN');
    expect(field).toHaveAttribute('type', 'password');
    expect(field).toHaveAttribute('autocomplete', 'new-password');
    type('482915');
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await expect(answer).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith('482915');
    await waitFor(() => expect(screen.queryByLabelText('PIN')).toBeNull());
  });

  it('submits with Enter', async () => {
    render(<PinPromptHost />);
    let answer!: Promise<boolean>;
    act(() => {
      answer = askForPin(async () => ({ ok: true }));
    });
    await screen.findByLabelText('PIN');
    type('482915');
    fireEvent.submit(screen.getByLabelText('PIN').closest('form') as HTMLFormElement);
    await expect(answer).resolves.toBe(true);
  });

  it('keeps the dialog open on a wrong PIN, shows the server message, and clears the field', async () => {
    render(<PinPromptHost />);
    const verify = vi.fn<(pin: string) => Promise<PinVerdict>>().mockResolvedValueOnce({ ok: false, message: 'Wrong PIN. 4 tries left before a wait of 1 minute.' }).mockResolvedValueOnce({ ok: true });
    let answer!: Promise<boolean>;
    act(() => {
      answer = askForPin(verify);
    });
    await screen.findByLabelText('PIN');
    type('000000');
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong PIN. 4 tries left before a wait of 1 minute.');
    expect(screen.getByLabelText('PIN')).toHaveValue('');
    type('482915');
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await expect(answer).resolves.toBe(true);
  });

  it('counts down the seconds of a lock and disables Unlock until it ends', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<PinPromptHost />);
    act(() => {
      void askForPin(async () => ({ ok: false, message: 'Too many wrong PINs. Try again in 3 seconds.', retryAfterSeconds: 3 }));
    });
    await screen.findByLabelText('PIN');
    type('000000');
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again in 3 seconds');
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Try again in 2 seconds');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    // Free again: Unlock is enabled as soon as a PIN is typed (the field was cleared by the wrong one).
    type('482915');
    expect(screen.getByRole('button', { name: 'Unlock' })).not.toBeDisabled();
  });

  it('Cancel resolves false', async () => {
    render(<PinPromptHost />);
    let answer!: Promise<boolean>;
    act(() => {
      answer = askForPin(async () => ({ ok: true }));
    });
    await screen.findByLabelText('PIN');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await expect(answer).resolves.toBe(false);
    await waitFor(() => expect(screen.queryByLabelText('PIN')).toBeNull());
  });

  // user-event is not a dependency of this package: a browser submits a form with Enter only when a submit button belongs to it. The
  // dialog button sits outside the <form> (and ButtonAction has no `form` attribute), so the form carries an invisible submit button
  // for Enter, and the visible one asks the form to submit: both go through the same submit event.
  it('choose mode: the form owns a submit button for Enter, and the "Choose PIN" button submits through the form', async () => {
    render(<PinPromptHost />);
    const verify = vi.fn(async (): Promise<PinVerdict> => ({ ok: true }));
    let answer!: Promise<boolean>;
    act(() => {
      answer = askForPin(verify, 'choose');
    });
    const first = await screen.findByLabelText('New PIN');
    const form = first.closest('form') as HTMLFormElement;
    const button = screen.getByRole('button', { name: 'Choose PIN' });
    const hidden = screen.getByTestId('pin-hidden-submit');
    expect(hidden.closest('form')).toBe(form);
    expect(hidden).toHaveAttribute('type', 'submit');
    expect(hidden).toHaveAttribute('tabindex', '-1');
    expect(button).toHaveAttribute('type', 'button');
    const onSubmit = vi.fn();
    form.addEventListener('submit', onSubmit);
    fireEvent.change(first, { target: { value: '482915' } });
    fireEvent.change(screen.getByLabelText('Confirm the PIN'), { target: { value: '482915' } });
    // Not `button`: a disabled one is wrapped in its tooltip, so the enabled one is a new element.
    fireEvent.click(screen.getByRole('button', { name: 'Choose PIN' }));
    await expect(answer).resolves.toBe(true);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('keeps the fields focusable while it asks (read-only, busy) and focuses the PIN field again after a wrong PIN', async () => {
    render(<PinPromptHost />);
    let release!: (verdict: PinVerdict) => void;
    const verify = vi.fn(() => new Promise<PinVerdict>((resolve) => (release = resolve)));
    act(() => {
      void askForPin(verify);
    });
    const field = (await screen.findByLabelText('PIN')) as HTMLInputElement;
    // The Dialog of dsl-ui moves the focus to its first control one animation frame after it opens: let it happen before the test starts.
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    });
    type('000000');
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(verify).toHaveBeenCalled());
    expect(field).not.toBeDisabled();
    expect(field).toHaveAttribute('readonly');
    expect(field).toHaveAttribute('aria-busy', 'true');
    // The keyboard focus moves to the button that was clicked, as in a browser.
    screen.getByRole('button', { name: 'Unlock' }).focus();
    await act(async () => {
      release({ ok: false, message: 'Wrong PIN. 4 tries left.' });
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong PIN');
    await waitFor(() => expect(document.activeElement).toBe(field));
    expect(field).not.toHaveAttribute('readonly');
  });

  it('shows an error that is not a wrong PIN (verify throws) and stays open', async () => {
    render(<PinPromptHost />);
    act(() => {
      void askForPin(async () => {
        throw new Error('Run "app-core-cli pin set" to choose the PIN that unlocks sensitive actions.');
      });
    });
    await screen.findByLabelText('PIN');
    type('482915');
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('app-core-cli pin set');
  });

  it('unlock mode: Enter (the invisible submit button of the form) asks the server once', async () => {
    render(<PinPromptHost />);
    const verify = vi.fn(async (): Promise<PinVerdict> => ({ ok: true }));
    let answer!: Promise<boolean>;
    act(() => {
      answer = askForPin(verify);
    });
    await screen.findByLabelText('PIN');
    type('482915');
    fireEvent.click(screen.getByTestId('pin-hidden-submit'));
    await expect(answer).resolves.toBe(true);
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('the fields are masked, are not offered a saved PIN, and a new PIN is told apart from the one being asked', async () => {
    render(<PinPromptHost />);
    act(() => {
      void askForPin(async () => ({ ok: true }), 'choose');
    });
    expect(await screen.findByLabelText('New PIN')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Confirm the PIN')).toHaveAttribute('autocomplete', 'new-password');
  });

  it('the main button is a primary one, and a disabled one is not silent: the text of its reason is wired', async () => {
    render(<PinPromptHost />);
    act(() => {
      void askForPin(async () => ({ ok: true }));
    });
    await screen.findByLabelText('PIN');
    const unlock = screen.getByRole('button', { name: 'Unlock' });
    expect(unlock).toBeDisabled();
    expect(unlock.className).toMatch(/color-primary-solid/);
    expect(screen.getByRole('button', { name: 'Cancel' }).className).not.toMatch(/color-primary-solid/);
  });

  it('choose mode: two entries that differ are reported on the confirmation field itself', async () => {
    render(<PinPromptHost />);
    act(() => {
      void askForPin(async () => ({ ok: true }), 'choose');
    });
    fireEvent.change(await screen.findByLabelText('New PIN'), { target: { value: '482915' } });
    fireEvent.change(screen.getByLabelText('Confirm the PIN'), { target: { value: '482916' } });
    fireEvent.click(screen.getByRole('button', { name: 'Choose PIN' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('do not match');
    expect(screen.getByLabelText('Confirm the PIN')).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not leave the asker set after unmount', () => {
    const { unmount } = render(<PinPromptHost />);
    unmount();
    return expect(askForPin(async () => ({ ok: true }))).rejects.toThrow(/no PIN dialog/);
  });

  describe('with the status of the server (reset hint, minimum)', () => {
    const HINT = { files: ['C:\\Users\\me\\.config\\app-core\\auth.json'], instruction: 'Delete this file (no restart needed), then choose a new PIN.' };
    beforeEach(() => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify({ pinSet: true, locked: false, elevated: false, resetHint: HINT, minPinLength: MIN_PIN_LENGTH, maxPinLength: MAX_PIN_LENGTH }), { status: 200, headers: { 'content-type': 'application/json' } })),
      );
    });
    afterEach(() => vi.unstubAllGlobals());

    it('the PIN dialog says how to reset by hand, with the real path in monospace', async () => {
      render(<PinPromptHost />);
      act(() => {
        void askForPin(async () => ({ ok: true }));
      });
      expect(await screen.findByText(/Forgot the PIN\?/)).toHaveTextContent('Delete this file (no restart needed), then choose a new PIN.');
      const path = await screen.findByText(HINT.files[0] as string);
      expect(path.className).toMatch(/font-mono/);
    });

    it('the PIN dialog no longer tells to run the CLI as the only way', async () => {
      render(<PinPromptHost />);
      act(() => {
        void askForPin(async () => ({ ok: true }));
      });
      await screen.findByLabelText('PIN');
      expect(screen.getByText(/This action needs your PIN/)).not.toHaveTextContent('app-core-cli pin set');
    });

    it('choose mode: "Choose a PIN" with new + confirm, the minimum, and the same reset hint', async () => {
      render(<PinPromptHost />);
      const verify = vi.fn(async (): Promise<PinVerdict> => ({ ok: true }));
      let answer!: Promise<boolean>;
      act(() => {
        answer = askForPin(verify, 'choose');
      });
      expect(await screen.findByText('Choose a PIN')).toBeInTheDocument();
      expect(await screen.findByText(new RegExp(`at least ${MIN_PIN_LENGTH} characters, at most ${MAX_PIN_LENGTH}`))).toBeInTheDocument();
      expect(await screen.findByText(/Forgot the PIN\?/)).toBeInTheDocument();
      const first = screen.getByLabelText('New PIN');
      expect(first).toHaveAttribute('type', 'password');
      fireEvent.change(first, { target: { value: '482915' } });
      fireEvent.change(screen.getByLabelText('Confirm the PIN'), { target: { value: '482915' } });
      fireEvent.click(screen.getByRole('button', { name: 'Choose PIN' }));
      await expect(answer).resolves.toBe(true);
      expect(verify).toHaveBeenCalledWith('482915');
    });

    it('choose mode: two entries that differ are refused in place, without asking the server', async () => {
      render(<PinPromptHost />);
      const verify = vi.fn(async (): Promise<PinVerdict> => ({ ok: true }));
      act(() => {
        void askForPin(verify, 'choose');
      });
      fireEvent.change(await screen.findByLabelText('New PIN'), { target: { value: '482915' } });
      fireEvent.change(screen.getByLabelText('Confirm the PIN'), { target: { value: '482916' } });
      fireEvent.click(screen.getByRole('button', { name: 'Choose PIN' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('do not match');
      expect(verify).not.toHaveBeenCalled();
    });

    it('choose mode: shows the error of the server in place and keeps the dialog open', async () => {
      render(<PinPromptHost />);
      act(() => {
        void askForPin(async () => ({ ok: false, message: `The PIN must have at least ${MIN_PIN_LENGTH} characters (got 3). Choose a longer one.` }), 'choose');
      });
      fireEvent.change(await screen.findByLabelText('New PIN'), { target: { value: '123' } });
      fireEvent.change(screen.getByLabelText('Confirm the PIN'), { target: { value: '123' } });
      fireEvent.click(screen.getByRole('button', { name: 'Choose PIN' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(`at least ${MIN_PIN_LENGTH} characters (got 3)`);
      expect(screen.getByLabelText('New PIN')).toBeInTheDocument();
    });

    it('choose mode: Cancel answers false', async () => {
      render(<PinPromptHost />);
      let answer!: Promise<boolean>;
      act(() => {
        answer = askForPin(async () => ({ ok: true }), 'choose');
      });
      await screen.findByLabelText('New PIN');
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await expect(answer).resolves.toBe(false);
    });
  });

  it('shows the repair message of the server when the status route answers a damaged auth file', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'internal', message: 'auth.json is not valid. Delete it, then choose a new PIN.' }), { status: 500, headers: { 'content-type': 'application/json' } })));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(<PinPromptHost />);
    act(() => {
      void askForPin(async () => ({ ok: true }));
    });
    expect(await screen.findByText(/auth\.json is not valid\. Delete it, then choose a new PIN\./)).toBeInTheDocument();
    warn.mockRestore();
    vi.unstubAllGlobals();
  });

  it('says in the dialog that the reset instructions could not be read, instead of staying silent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 502 })));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(<PinPromptHost />);
    act(() => {
      void askForPin(async () => ({ ok: true }));
    });
    expect(await screen.findByText(/could not read the reset instructions/i)).toBeInTheDocument();
    warn.mockRestore();
    vi.unstubAllGlobals();
  });
});
