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

// A path with a line-break opportunity after each separator: a long one wraps between folders, and only breaks inside a name when
// one name alone is wider than the block. The <wbr> are empty: the text of the path stays whole (select, copy, search).
function breakableAtSeparators(path: string): React.ReactNode[] {
  return path.split(/(?<=[\\/])/).flatMap((part, index) => (index === 0 ? [part] : [<wbr key={index} />, part]));
}

// A separated, small and muted block under a form, so the reset is findable but never competes with the main action.
function HintBlock({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div className="mt-4 min-w-0 space-y-1.5 border-t border-border pt-3 text-xs leading-relaxed text-muted">{children}</div>;
}

// "Forgot the PIN?": what to delete in the file system to start again, with the real paths (select-all: one click selects a path).
export function ResetHint({ status, error }: { status: PinStatus | undefined; error: string | undefined }): React.ReactElement | null {
  if (error !== undefined) {
    return (
      <HintBlock>
        <p>{`Forgot the PIN? Could not read the reset instructions: ${error}`}</p>
      </HintBlock>
    );
  }
  if (status === undefined) {
    return null;
  }
  if (status.resetHint === undefined) {
    return (
      <HintBlock>
        <p>Forgot the PIN? Delete auth.json in the app-core config dir (APP_CORE_CONFIG_DIR, else ~/.config/app-core), then choose a new PIN. This server is older than the page and does not give the path.</p>
      </HintBlock>
    );
  }
  return (
    <HintBlock>
      <p>{`Forgot the PIN? ${status.resetHint.instruction}`}</p>
      {status.resetHint.files.map((file) => (
        <code key={file} className="block min-w-0 select-all break-words rounded border border-border bg-bg-secondary px-2 py-1 font-mono text-content">
          {breakableAtSeparators(file)}
        </code>
      ))}
    </HintBlock>
  );
}
