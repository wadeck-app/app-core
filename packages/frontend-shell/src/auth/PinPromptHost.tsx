import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from '@wadeck-app/dsl-ui';
import { getErrorMessage } from '../errors.js';
import { setPinAsker, type PinAsker, type PinVerdict } from './pinPrompt.js';

const INPUT = 'w-full rounded border border-border bg-surface px-2 py-1.5 text-sm text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50';
const BUTTON = 'inline-flex items-center rounded border border-border bg-surface px-3 py-1.5 text-sm text-content transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50';

interface Pending {
  verify: (pin: string) => Promise<PinVerdict>;
  settle: (accepted: boolean) => void;
}

// The one dialog that asks the PIN, for every request that needs it at the moment (the fetcher shares one elevation, see
// auth/elevation.ts). Mounted once, in the app; it registers itself as the asker the fetcher calls.
export function PinPromptHost(): React.ReactElement {
  const [pending, setPending] = useState<Pending | null>(null);
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef<Pending | null>(null);

  const asker = useCallback<PinAsker>(
    (verify) =>
      new Promise<boolean>((resolve) => {
        const next: Pending = {
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
        setMessage(undefined);
        setLockedUntil(0);
        setBusy(false);
        setPending(next);
      }),
    [],
  );

  useEffect(() => {
    setPinAsker(asker);
    return () => {
      setPinAsker(undefined);
      pendingRef.current?.settle(false);
    };
  }, [asker]);

  // The seconds of a lock count down on screen.
  useEffect(() => {
    if (lockedUntil <= Date.now()) {
      return undefined;
    }
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  const remaining = Math.max(0, Math.ceil((lockedUntil - now) / 1000));
  const locked = lockedUntil > 0 && remaining > 0;

  const submit = async (): Promise<void> => {
    if (pending === null || busy || locked || pin === '') {
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
      setMessage(verdict.message);
      if (verdict.retryAfterSeconds !== undefined) {
        const at = Date.now() + verdict.retryAfterSeconds * 1000;
        setNow(Date.now());
        setLockedUntil(at);
      }
    } catch (err) {
      setMessage(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const shown = locked ? `Too many wrong PINs. Try again in ${remaining} ${remaining === 1 ? 'second' : 'seconds'}.` : message;

  return (
    <Dialog
      title="PIN needed"
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) {
          pending?.settle(false);
        }
      }}
      size="sm"
      actions={
        <>
          <button type="button" className={BUTTON} onClick={() => pending?.settle(false)}>
            Cancel
          </button>
          <button type="button" className={BUTTON} disabled={busy || locked || pin === ''} onClick={() => void submit()}>
            Unlock
          </button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <p className="mb-3 text-sm text-muted">This action needs your PIN (the one chosen with &quot;app-core-cli pin set&quot;). It stays unlocked while you use the dashboard.</p>
        <label className="block text-sm text-content">
          PIN
          <input className={`${INPUT} mt-1`} type="password" autoComplete="off" autoFocus value={pin} disabled={busy} onChange={(event) => setPin(event.target.value)} />
        </label>
        {shown !== undefined ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {shown}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
