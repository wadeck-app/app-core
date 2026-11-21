import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Dialog } from '@wadeck-app/dsl-ui';
import { getErrorMessage } from '../errors.js';
import { setPinAsker, type PinAsker, type PinPromptMode, type PinVerdict } from './pinPrompt.js';
import { lengthRule } from './pinStatus.js';
import { ResetHint, usePinStatus } from './ResetHint.js';
import { useLockCountdown } from './useLockCountdown.js';

export const PIN_INPUT = 'w-full rounded border border-border bg-surface px-2 py-1.5 text-sm text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50';
export const PIN_BUTTON = 'inline-flex items-center rounded border border-border bg-surface px-3 py-1.5 text-sm text-content transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50';

interface Pending {
  mode: PinPromptMode;
  verify: (pin: string) => Promise<PinVerdict>;
  settle: (accepted: boolean) => void;
}

// The one dialog that asks the PIN ('enter') or asks to choose it ('choose', when none exists), for every request that needs it at
// the moment (the fetcher shares one elevation, see auth/elevation.ts). Mounted once, in the app; it registers itself as the asker
// the fetcher calls.
export function PinPromptHost(): React.ReactElement {
  const [pending, setPending] = useState<Pending | null>(null);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef<Pending | null>(null);
  const pinFieldRef = useRef<HTMLInputElement>(null);
  const [refocus, setRefocus] = useState(0);
  useEffect(() => {
    if (refocus > 0) {
      pinFieldRef.current?.focus();
    }
  }, [refocus]);
  const formId = useId();
  const countdown = useLockCountdown();
  const { status, error: statusError } = usePinStatus(pending !== null);

  const asker = useCallback<PinAsker>(
    (verify, mode = 'enter') =>
      new Promise<boolean>((resolve) => {
        const next: Pending = {
          mode,
          verify,
          settle: (accepted) => {
            pendingRef.current = null;
            setPending(null);
            resolve(accepted);
          },
        };
        // A second request cannot get here (the elevation is shared), but if it did, the first one would never be answered.
        pendingRef.current?.settle(false);
        pendingRef.current = next;
        setPin('');
        setConfirm('');
        setMessage(undefined);
        countdown.clear();
        setBusy(false);
        setPending(next);
      }),
    // `countdown.clear` only sets state: the asker must not be re-registered at every render.
    [],
  );

  useEffect(() => {
    setPinAsker(asker);
    return () => {
      setPinAsker(undefined);
      pendingRef.current?.settle(false);
    };
  }, [asker]);

  const choosing = pending?.mode === 'choose';
  const { locked, remaining } = countdown;

  const submit = async (): Promise<void> => {
    if (pending === null || busy || locked || pin === '') {
      return;
    }
    if (choosing && confirm !== pin) {
      setMessage('The two entries do not match. Type the same PIN twice.');
      return;
    }
    setBusy(true);
    try {
      const verdict = await pending.verify(pin);
      if (verdict.ok) {
        pending.settle(true);
        return;
      }
      setPin('');
      setConfirm('');
      setMessage(verdict.message);
      // The fields are read-only while asking (not disabled), but the focus went to the button that was clicked: type again at once.
      // After the render: the clicked button is disabled by it (empty field), and the dialog moves the focus off a disabled element.
      setRefocus((count) => count + 1);
      if (verdict.retryAfterSeconds !== undefined) {
        countdown.lock(verdict.retryAfterSeconds);
      }
    } catch (err) {
      setMessage(getErrorMessage(err));
      setRefocus((count) => count + 1);
    } finally {
      setBusy(false);
    }
  };

  const shown = locked ? `Too many wrong PINs. Try again in ${remaining} ${remaining === 1 ? 'second' : 'seconds'}.` : message;
  const rule = lengthRule(status?.minPinLength, status?.maxPinLength);
  const canSubmit = !(busy || locked || pin === '' || (choosing && confirm === ''));

  return (
    <Dialog
      title={choosing ? 'Choose a PIN' : 'PIN needed'}
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) {
          pending?.settle(false);
        }
      }}
      size="sm"
      actions={
        <>
          <button type="button" className={PIN_BUTTON} onClick={() => pending?.settle(false)}>
            Cancel
          </button>
                    {/* The button lives in the dialog actions, outside the form: `form` makes it the submit button of it, so Enter in a field submits too. */}
          <button type="submit" form={formId} className={PIN_BUTTON} disabled={!canSubmit}>
            {choosing ? 'Choose PIN' : 'Unlock'}
          </button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {choosing ? (
          <p className="mb-3 text-sm text-muted">{`No PIN is set yet. Choose the PIN that unlocks sensitive actions${rule === '' ? '' : ` (${rule})`}. You can also run "app-core-cli pin set" in a terminal.`}</p>
        ) : (
          <p className="mb-3 text-sm text-muted">This action needs your PIN. It stays unlocked while you use the dashboard.</p>
        )}
        <label className="block text-sm text-content">
          {choosing ? 'New PIN' : 'PIN'}
          <input className={`${PIN_INPUT} mt-1`} type="password" autoComplete="off" autoFocus ref={pinFieldRef} value={pin} readOnly={busy} aria-busy={busy} onChange={(event) => setPin(event.target.value)} />
        </label>
        {choosing ? (
          <label className="mt-2 block text-sm text-content">
            Confirm the PIN
            <input className={`${PIN_INPUT} mt-1`} type="password" autoComplete="off" value={confirm} readOnly={busy} aria-busy={busy} onChange={(event) => setConfirm(event.target.value)} />
          </label>
        ) : null}
        {shown !== undefined ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {shown}
          </p>
        ) : null}
        <ResetHint status={status} error={statusError} />
      </form>
    </Dialog>
  );
}
