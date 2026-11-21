// The bridge between the fetcher (which needs the PIN) and the dialog (which asks it): the fetcher is not a React component.

export type PinVerdict = { ok: true } | { ok: false; message: string; retryAfterSeconds?: number };

// 'enter': the PIN exists, type it. 'choose': no PIN exists yet, choose one (new + confirm).
export type PinPromptMode = 'enter' | 'choose';

// `verify` sends the PIN to the server. The asker (the dialog) keeps asking until it is ok or the user cancels: resolves true when
// the PIN was accepted, false when the user cancelled.
export type PinAsker = (verify: (pin: string) => Promise<PinVerdict>, mode?: PinPromptMode) => Promise<boolean>;

let asker: PinAsker | undefined;

export function setPinAsker(next: PinAsker | undefined): void {
  asker = next;
}

export function askForPin(verify: (pin: string) => Promise<PinVerdict>, mode: PinPromptMode = 'enter'): Promise<boolean> {
  if (asker === undefined) {
    return Promise.reject(new Error('This action needs the PIN, but no PIN dialog is mounted in this page (PinPromptHost). Reload the page; if it persists, the shell is broken.'));
  }
  return asker(verify, mode);
}
