import React, { useCallback, useContext, useEffect, useState } from 'react';
import { LockKeyhole, X } from 'lucide-react';
import { Badge, IconButton, ToastContext } from '@wadeck-app/dsl-ui';
import { getErrorMessage } from '../errors.js';
import { ACCESS_TOKEN_KEY, clearAccessToken, onAccessTokenChange } from './accessToken.js';
import { CANCELLED_MESSAGE, CHOOSE_CANCELLED_MESSAGE, choosePin, elevate } from './elevation.js';
import { PinMenu } from './PinMenu.js';
import { readPinStatus } from './pinStatus.js';
import { readJson } from './readJson.js';

async function readElevated(): Promise<boolean> {
  const res = await fetch('/api/auth/status');
  const body = await readJson<{ elevated?: unknown }>(res, 'GET /api/auth/status');
  if (typeof body.elevated !== 'boolean') {
    throw new Error('GET /api/auth/status has no boolean "elevated"; the server is older than this frontend');
  }
  return body.elevated;
}

// Locked: "Enter PIN" (the unlock dialog, or the Choose-a-PIN one when no PIN exists). Unlocked ("sudo mode"): a "Sudo" badge with a
// button to leave it. The PIN settings entry (choose / change) stays in both states. Locking ends the session on the server (every
// access token dies at once, the refresh cookie is cleared) and forgets the token of this browser.
export function LockControl(): React.ReactElement {
  // Absent from a tree without a ToastProvider (a test of a part of the bar): the toast is then skipped, the lock still happens.
  const toast = useContext(ToastContext);
  // The server's word: a live refresh session. A token kept here without it is stale (the session was ended elsewhere): not sudo.
  const [elevated, setElevated] = useState(false);

  const check = useCallback(async (): Promise<void> => {
    try {
      setElevated(await readElevated());
    } catch (err) {
      console.warn(`[shell] cannot tell whether sensitive actions are unlocked (GET /api/auth/status): ${getErrorMessage(err)}`);
      // Not knowing is not "unlocked": never show sudo on a guess.
      setElevated(false);
    }
  }, []);

  useEffect(() => {
    void check();
    const offToken = onAccessTokenChange(() => void check());
    const onFocus = (): void => void check();
    // The token lives in localStorage: another tab that unlocks or locks fires this one (null: the whole storage was cleared).
    const onStorage = (event: StorageEvent): void => {
      if (event.key === null || event.key === ACCESS_TOKEN_KEY) {
        void check();
      }
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);
    return () => {
      offToken();
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
    };
  }, [check]);

  const enterPin = async (): Promise<void> => {
    try {
      // With no PIN there is nothing to enter: the first thing to do is to choose one.
      if ((await readPinStatus()).pinSet) {
        await elevate();
      } else {
        await choosePin();
      }
    } catch (err) {
      const message = getErrorMessage(err);
      // Closing the dialog is an answer, not a failure.
      if (message !== CANCELLED_MESSAGE && message !== CHOOSE_CANCELLED_MESSAGE) {
        toast?.error(`Could not unlock sensitive actions: ${message}`);
      }
    } finally {
      await check();
    }
  };

  const lock = async (): Promise<void> => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      // 204 or 200 (even {loggedOut:false}: no session on the server to end) both mean this browser is locked; a refusal throws with the server's message.
      if (!res.ok) {
        await readJson(res, 'POST /api/auth/logout');
      }
      setElevated(false);
      clearAccessToken();
      toast?.success('Sensitive actions are locked: the PIN is asked again at the next one.');
    } catch (err) {
      toast?.error(`Could not lock sensitive actions: ${getErrorMessage(err)}`);
    }
  };

  return (
    <>
      {elevated ? (
        <span className="flex items-center gap-0.5">
          <Badge label="Sudo" variant="warning" tone="subtle" />
          <IconButton
            icon={<X size={14} />}
            aria-label="Leave sudo mode (lock sensitive actions)"
            title="Sensitive actions are unlocked. Click × to lock them."
            variant="ghost"
            size="icon-sm"
            onClick={() => void lock()}
          />
        </span>
      ) : (
        <IconButton icon={<LockKeyhole size={14} />} aria-label="Enter PIN" title="Enter PIN to unlock sensitive actions" variant="ghost" size="icon-sm" onClick={() => void enterPin()} />
      )}
      <PinMenu />
    </>
  );
}
