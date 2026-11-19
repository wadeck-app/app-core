import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    expect(field).toHaveAttribute('autocomplete', 'off');
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

  it('does not leave the asker set after unmount', () => {
    const { unmount } = render(<PinPromptHost />);
    unmount();
    return expect(askForPin(async () => ({ ok: true }))).rejects.toThrow(/no PIN dialog/);
  });
});
