import React, { useRef, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { ButtonAction } from '@wadeck-app/dsl-ui';
import { TopBarPopover } from '../layout/TopBarPopover.js';
import { getErrorMessage } from '../errors.js';
import { changePin, choosePin } from './elevation.js';
import { PinField, submitBlockedReason } from './PinField.js';
import { lengthRule } from './pinStatus.js';
import { ResetHint, usePinStatus } from './ResetHint.js';
import { useLockCountdown } from './useLockCountdown.js';

// The "Change PIN" form: current PIN, new PIN, confirmation. The server checks the current PIN with the lockout of the login.
function ChangePinForm({ rule }: { rule: string }): React.ReactElement {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [mismatch, setMismatch] = useState<string | undefined>(undefined);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const countdown = useLockCountdown();
  const { locked, remaining } = countdown;

  // FieldText does not forward a ref: the current PIN is the first input of the form.
  const focusCurrent = (): void => formRef.current?.querySelector('input')?.focus();

  const submit = async (): Promise<void> => {
    if (busy || locked || current === '' || next === '') {
      return;
    }
    setDone(false);
    if (confirm !== next) {
      setMessage(undefined);
      setMismatch('The two new entries do not match. Type the same PIN twice.');
      return;
    }
    setMismatch(undefined);
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
      focusCurrent();
      if (verdict.retryAfterSeconds !== undefined) {
        countdown.lock(verdict.retryAfterSeconds);
      }
    } catch (err) {
      setMessage(getErrorMessage(err));
      focusCurrent();
    } finally {
      setBusy(false);
    }
  };

  const shown = locked ? `Too many wrong PINs. Try again in ${remaining} ${remaining === 1 ? 'second' : 'seconds'}.` : message;
  const filled = current !== '' && next !== '' && confirm !== '';
  const blockedReason = submitBlockedReason({ busy, locked, remaining, filled, fieldsHint: 'Fill the three fields' });

  return (
    <form
      ref={formRef}
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-content">Change PIN</h3>
        <p className="text-xs leading-relaxed text-muted">Every session is closed: you stay unlocked here, other browsers are asked again.</p>
      </div>
      <PinField label="Current PIN" value={current} onChange={setCurrent} busy={busy} />
      <PinField label="New PIN" value={next} onChange={setNext} busy={busy} autoComplete="new-password" description={rule === '' ? undefined : rule} />
      <PinField label="Confirm the new PIN" value={confirm} onChange={setConfirm} busy={busy} autoComplete="new-password" error={mismatch} />
      {shown !== undefined ? (
        <p role="alert" className="text-sm text-danger">
          {shown}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="text-sm text-success-text">
          PIN changed. The new PIN is in force now.
        </p>
      ) : null}
      <div className="flex justify-end">
        <ButtonAction type="submit" label="Change PIN" variant="primary" disabled={busy || locked || !filled} disabledReason={blockedReason} loading={busy} />
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
    <div className="w-80 max-w-full text-sm">
      {status === undefined && error === undefined ? <p className="text-muted">Reading the PIN status...</p> : null}
      {status?.pinSet === false ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-content">Choose a PIN</h3>
            <p className="text-xs leading-relaxed text-muted">{`No PIN is set yet: sensitive actions are refused until you choose one${lengthRule(status.minPinLength, status.maxPinLength) === '' ? '' : ` (${lengthRule(status.minPinLength, status.maxPinLength)})`}.`}</p>
          </div>
          {chooseError === undefined ? null : (
            <p role="alert" className="text-sm text-danger">
              {chooseError}
            </p>
          )}
          <div className="flex justify-end">
            <ButtonAction label="Choose a PIN" variant="primary" onClick={() => void choose()} />
          </div>
        </div>
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
    <TopBarPopover icon={<KeyRound size={14} />} label="PIN settings">
      <PinMenuContent />
    </TopBarPopover>
  );
}
