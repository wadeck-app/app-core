import React, { useEffect, useState } from 'react';
import { getErrorMessage } from '../errors.js';
import { readPinStatus, type PinStatus } from './pinStatus.js';

// The status of the PIN, read each time `active` turns true (a dialog opens): the minimum length and how to reset by hand.
export function usePinStatus(active: boolean): { status: PinStatus | undefined; error: string | undefined } {
  const [status, setStatus] = useState<PinStatus | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    let live = true;
    setStatus(undefined);
    setError(undefined);
    readPinStatus().then(
      (next) => live && setStatus(next),
      (err: unknown) => {
        console.warn(`[shell] cannot read the PIN status (GET /api/auth/status): ${getErrorMessage(err)}`);
        if (live) {
          setError(getErrorMessage(err));
        }
      },
    );
    return () => {
      live = false;
    };
  }, [active]);
  return { status, error };
}

// "Forgot the PIN?": what to delete in the file system to start again, with the real paths (select-all: one click selects a path).
export function ResetHint({ status, error }: { status: PinStatus | undefined; error: string | undefined }): React.ReactElement | null {
  if (error !== undefined) {
    return <p className="mt-3 text-xs text-muted">{`Forgot the PIN? Could not read the reset instructions: ${error}`}</p>;
  }
  if (status === undefined) {
    return null;
  }
  if (status.resetHint === undefined) {
    return <p className="mt-3 text-xs text-muted">Forgot the PIN? Delete auth.json in the app-core config dir (APP_CORE_CONFIG_DIR, else ~/.config/app-core), then choose a new PIN. This server is older than the page and does not give the path.</p>;
  }
  return (
    <div className="mt-3 text-xs text-muted">
      <p>{`Forgot the PIN? ${status.resetHint.instruction}`}</p>
      {status.resetHint.files.map((file) => (
        <p key={file} className="mt-1 select-all break-all font-mono text-content">
          {file}
        </p>
      ))}
    </div>
  );
}
