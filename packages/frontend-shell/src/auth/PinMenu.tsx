import React, { useRef, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { IconButton, Popover } from '@wadeck-app/dsl-ui';
import { getErrorMessage } from '../errors.js';
import { changePin, choosePin } from './elevation.js';
import { PIN_BUTTON, PIN_INPUT } from './PinPromptHost.js';
import { lengthRule } from './pinStatus.js';
import { ResetHint, usePinStatus } from './ResetHint.js';
import { useLockCountdown } from './useLockCountdown.js';

// The "Change PIN" form: current PIN, new PIN, confirmation. The server checks the current PIN with the lockout of the login.
function ChangePinForm({ rule }: { rule: string }): React.ReactElement {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const currentRef = useRef<HTMLInputElement>(null);
  const countdown = useLockCountdown();
  const { locked, remaining } = countdown;

  const submit = async (): Promise<void> => {
    if (busy || locked || current === '' || next === '') {
      return;
    }
    setDone(false);
    if (confirm !== next) {
      setMessage('The two new entries do not match. Type the same PIN twice.');
      return;
    }
    setBusy(true);
    try {
      const verdict = await changePin(current, next);
      if (verdict.ok) {
        setCurrent('');
        setNext('');
        setConfirm('');
        setMessage(undefined);
        setDone(true);
        return;
      }
      // The wrong current PIN is retyped; the new one stays.
      setCurrent('');
      setMessage(verdict.message);
      // The fields are read-only while asking (not disabled), but the focus went to the button that was clicked: type the current PIN again at once.
      currentRef.current?.focus();
      if (verdict.retryAfterSeconds !== undefined) {
        countdown.lock(verdict.retryAfterSeconds);
      }
    } catch (err) {
      setMessage(getErrorMessage(err));
      currentRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const shown = locked ? `Too many wrong PINs. Try again in ${remaining} ${remaining === 1 ? 'second' : 'seconds'}.` : message;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <p className="mb-2 text-sm text-muted">{`Change the PIN. Every session is closed: you stay unlocked here, other browsers are asked again.${rule === '' ? '' : ` PIN: ${rule}.`}`}</p>
      <label className="block text-sm text-content">
        Current PIN
        <input className={`${PIN_INPUT} mt-1`} type="password" autoComplete="off" ref={currentRef} value={current} readOnly={busy} aria-busy={busy} onChange={(event) => setCurrent(event.target.value)} />
      </label>
      <label className="mt-2 block text-sm text-content">
        New PIN
        <input className={`${PIN_INPUT} mt-1`} type="password" autoComplete="off" value={next} readOnly={busy} aria-busy={busy} onChange={(event) => setNext(event.target.value)} />
      </label>
      <label className="mt-2 block text-sm text-content">
        Confirm the new PIN
        <input className={`${PIN_INPUT} mt-1`} type="password" autoComplete="off" value={confirm} readOnly={busy} aria-busy={busy} onChange={(event) => setConfirm(event.target.value)} />
      </label>
      {shown !== undefined ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {shown}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="mt-2 text-sm text-success-text">
          PIN changed. The new PIN is in force now.
        </p>
      ) : null}
      <div className="mt-3 flex justify-end">
        <button type="submit" className={PIN_BUTTON} disabled={busy || locked || current === '' || next === '' || confirm === ''}>
          Change PIN
        </button>
      </div>
    </form>
  );
}

function PinMenuContent(): React.ReactElement {
  const { status, error } = usePinStatus(true);
  const [chooseError, setChooseError] = useState<string | undefined>(undefined);

  const choose = async (): Promise<void> => {
    setChooseError(undefined);
    try {
      await choosePin();
      // The PIN exists now: reopen to see the change form.
    } catch (err) {
      setChooseError(getErrorMessage(err));
    }
  };

  return (
    <div className="w-72 text-sm">
      {status === undefined && error === undefined ? <p className="text-muted">Reading the PIN status...</p> : null}
      {status?.pinSet === false ? (
        <>
          <p className="mb-2 text-muted">{`No PIN is set yet: sensitive actions are refused until you choose one${lengthRule(status.minPinLength, status.maxPinLength) === '' ? '' : ` (${lengthRule(status.minPinLength, status.maxPinLength)})`}.`}</p>
          <button type="button" className={PIN_BUTTON} onClick={() => void choose()}>
            Choose a PIN
          </button>
          {chooseError === undefined ? null : (
            <p role="alert" className="mt-2 text-danger">
              {chooseError}
            </p>
          )}
        </>
      ) : null}
      {status?.pinSet === true ? <ChangePinForm rule={lengthRule(status.minPinLength, status.maxPinLength)} /> : null}
      <ResetHint status={status} error={error} />
    </div>
  );
}

// Top-bar entry for the PIN, reachable locked, unlocked, and while no PIN exists: choose the first PIN, or change it with the
// current one. The lock button (LockControl) stays the way to lock.
export function PinMenu(): React.ReactElement {
  return (
    <Popover side="bottom" align="end" trigger={<IconButton icon={<KeyRound size={14} />} aria-label="PIN settings" title="PIN settings" variant="ghost" size="icon-sm" />}>
      <PinMenuContent />
    </Popover>
  );
}
