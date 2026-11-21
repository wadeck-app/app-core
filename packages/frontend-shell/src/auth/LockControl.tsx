import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { IconButton, ToastContext } from '@wadeck-app/dsl-ui';
import { getErrorMessage } from '../errors.js';
import { clearAccessToken, getAccessToken, onAccessTokenChange } from './accessToken.js';
import { PinMenu } from './PinMenu.js';
import { readJson } from './readJson.js';

async function readElevated(): Promise<boolean> {
  const res = await fetch('/api/auth/status');
  const body = await readJson<{ elevated?: unknown }>(res, 'GET /api/auth/status');
  if (typeof body.elevated !== 'boolean') {
    throw new Error('GET /api/auth/status has no boolean "elevated"; the server is older than this frontend');
  }
  return body.elevated;
}

// The PIN entry (always) and "Lock now" (only while unlocked: a live refresh cookie, or an access token stored here). Locking ends the
// session on the server (every access token dies at once, the refresh cookie is cleared) and forgets the token of this browser.
export function LockControl(): React.ReactElement {
  // Absent from a tree without a ToastProvider (a test of a part of the bar): the toast is then skipped, the lock still happens.
  const toast = useContext(ToastContext);
  const [elevated, setElevated] = useState(false);
  const [hasToken, setHasToken] = useState(() => getAccessToken() !== undefined);

  const check = useCallback(async (): Promise<void> => {
    setHasToken(getAccessToken() !== undefined);
    try {
      setElevated(await readElevated());
    } catch (err) {
      console.warn(`[shell] cannot tell whether sensitive actions are unlocked (GET /api/auth/status): ${getErrorMessage(err)}`);
    }
  }, []);

  useEffect(() => {
    void check();
    return onAccessTokenChange(() => void check());
  }, [check]);

  // The PIN menu stays reachable locked: it is where a first PIN is chosen and the PIN is changed.
  if (!elevated && !hasToken) {
    return <PinMenu />;
  }

  const lock = async (): Promise<void> => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      // 204 or 200 (even {loggedOut:false}: no session on the server to end) both mean this browser is locked; a refusal throws with the server's message.
      if (!res.ok) {
        await readJson(res, 'POST /api/auth/logout');
      }
      setElevated(false);
      setHasToken(false);
      clearAccessToken();
      toast?.success('Sensitive actions are locked: the PIN is asked again at the next one.');
    } catch (err) {
      toast?.error(`Could not lock sensitive actions: ${getErrorMessage(err)}`);
    }
  };

  return (
    <>
      <PinMenu />
      <IconButton icon={<Lock size={14} />} aria-label="Lock sensitive actions" title="Lock sensitive actions" variant="ghost" size="icon-sm" onClick={() => void lock()} />
    </>
  );
}
