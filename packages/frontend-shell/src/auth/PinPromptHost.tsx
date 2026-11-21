import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ButtonAction, Dialog } from '@wadeck-app/dsl-ui';
import { getErrorMessage } from '../errors.js';
import { PinField, submitBlockedReason } from './PinField.js';
import { setPinAsker, type PinAsker, type PinPromptMode, type PinVerdict } from './pinPrompt.js';
import { lengthRule } from './pinStatus.js';
import { ResetHint, usePinStatus } from './ResetHint.js';
import { useLockCountdown } from './useLockCountdown.js';

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
  const [mismatch, setMismatch] = useState<string | undefined>(undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const formId = useId();
  const [refocus, setRefocus] = useState(0);
  useEffect(() => {
    if (refocus > 0) {
      // FieldText does not forward a ref: the PIN field is the first input of the form.
      formRef.current?.querySelector('input')?.focus();
    }
  }, [refocus]);
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
        setMismatch(undefined);
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
      setMessage(undefined);
      setMismatch('The two entries do not match. Type the same PIN twice.');
      return;
    }
    setMismatch(undefined);
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
  const filled = pin !== '' && (!choosing || confirm !== '');
  const canSubmit = !(busy || locked || !filled);
  const blockedReason = submitBlockedReason({ busy, locked, remaining, filled, fieldsHint: choosing ? 'Fill both fields' : 'Type the PIN' });

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
          <ButtonAction label="Cancel" variant="secondary" onClick={() => pending?.settle(false)} />
          {/* The button lives in the dialog actions, outside the form: its `form` attribute makes it the submit button of the form, so a click and Enter take the same path. */}
          <ButtonAction label={choosing ? 'Choose PIN' : 'Unlock'} variant="primary" disabled={!canSubmit} disabledReason={blockedReason} loading={busy} type="submit" form={formId} />
        </>
      }
    >
      <form
        ref={formRef}
        id={formId}
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {choosing ? (
          <p className="text-sm text-muted">{`No PIN is set yet. Choose the PIN that unlocks sensitive actions${rule === '' ? '' : ` (${rule})`}. You can also run "app-core-cli pin set" in a terminal.`}</p>
        ) : (
          <p className="text-sm text-muted">This action needs your PIN. It stays unlocked while you use the dashboard.</p>
        )}
        <PinField label={choosing ? 'New PIN' : 'PIN'} value={pin} onChange={setPin} busy={busy} autoFocus autoComplete={choosing ? 'new-password' : 'off'} />
        {choosing ? <PinField label="Confirm the PIN" value={confirm} onChange={setConfirm} busy={busy} autoComplete="new-password" error={mismatch} /> : null}
        {shown !== undefined ? (
          <p role="alert" className="text-sm text-danger">
            {shown}
          </p>
        ) : null}
        <ResetHint status={status} error={statusError} />
      </form>
    </Dialog>
  );
}
