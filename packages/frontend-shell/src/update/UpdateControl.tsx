import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CircleArrowUp, Info, LoaderCircle, TriangleAlert } from 'lucide-react';
import { IconButton, Popover } from '@wadeck-app/dsl-ui';
import { readJson } from '../auth/readJson.js';
import { getErrorMessage } from '../errors.js';
import { fetcher } from '../fetcher.js';

// Cheap on the server (two small files, no network): the shell asks again every 5 minutes and when the window gets the focus.
export const UPDATE_POLL_MS = 5 * 60 * 1000;
// How long "Restart now" waits for the server to answer with the new version before saying it did not come back.
const RESTART_WAIT_MS = 90_000;

// The answer of GET /api/app-update (server/src/appUpdate.ts).
interface AppUpdate {
  state: 'up-to-date' | 'restart-needed' | 'update-failed' | 'update-available' | 'applying' | 'unknown';
  reason?: string;
  running: string | null;
  installed: string | null;
  latest: string | null;
  failure?: { message: string; step?: string; logFile?: string };
  canRestart: boolean;
}

async function readUpdate(): Promise<AppUpdate> {
  const res = await fetch('/api/app-update');
  const body = await readJson<Partial<AppUpdate>>(res, 'GET /api/app-update');
  if (typeof body.state !== 'string') {
    throw new Error('GET /api/app-update has no "state"; the server is older than this frontend');
  }
  return body as AppUpdate;
}

export interface UpdateControlProps {
  // Reloads the page once the new version runs; tests inject their own.
  reload?: () => void;
  // Pause between two questions while waiting for the restarted server.
  restartPollMs?: number;
}

// The update indicator of the top bar: hidden when up to date; green when the installed version waits for a restart (with the restart
// button); orange when the last update failed; neutral while one is applying or available, and when the state is unknown.
export function UpdateControl({ reload = () => window.location.reload(), restartPollMs = 1000 }: UpdateControlProps): React.ReactElement | null {
  const [update, setUpdate] = useState<AppUpdate | undefined>(undefined);
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | undefined>(undefined);
  const mounted = useRef(true);

  const check = useCallback(async (): Promise<void> => {
    try {
      const next = await readUpdate();
      if (mounted.current) {
        setUpdate(next);
      }
    } catch (err) {
      console.warn(`[shell] cannot tell whether an update is waiting (GET /api/app-update): ${getErrorMessage(err)}`);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void check();
    const timer = setInterval(() => void check(), UPDATE_POLL_MS);
    const onFocus = (): void => void check();
    window.addEventListener('focus', onFocus);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [check]);

  if (update === undefined || update.state === 'up-to-date') {
    return null;
  }

  // POST (the PIN dialog appears by itself: the route is sensitive), then ask until the server answers with the installed version.
  const restart = async (): Promise<void> => {
    const target = update.installed;
    setRestartError(undefined);
    setRestarting(true);
    try {
      await fetcher('POST /api/app-update/restart');
      const deadline = Date.now() + RESTART_WAIT_MS;
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, restartPollMs));
        try {
          if ((await readUpdate()).running === target) {
            reload();
            return;
          }
        } catch {
          // Down while it restarts: ask again.
        }
        if (Date.now() > deadline) {
          throw new Error(`The server did not answer with ${target ?? 'the new version'} within ${RESTART_WAIT_MS / 1000} seconds. Start it yourself ("app-core-cli serve"), then reload the page.`);
        }
      }
    } catch (err) {
      if (mounted.current) {
        setRestartError(getErrorMessage(err));
        setRestarting(false);
      }
    }
  };

  const icon =
    update.state === 'restart-needed' ? (
      <CircleArrowUp size={14} className="text-success-text" />
    ) : update.state === 'update-failed' ? (
      <TriangleAlert size={14} className="text-warning-text" />
    ) : update.state === 'applying' ? (
      <LoaderCircle size={14} className="animate-spin text-muted" />
    ) : update.state === 'update-available' ? (
      <CircleArrowUp size={14} className="text-muted" />
    ) : (
      <Info size={14} className="text-muted" />
    );

  return (
    <Popover side="bottom" align="end" trigger={<IconButton icon={icon} aria-label="app-core update" title="app-core update" variant="ghost" size="icon-sm" />}>
      <div className="max-w-80 space-y-2 text-sm">
        {update.state === 'restart-needed' ? (
          <>
            <p className="font-semibold text-content">{`${update.installed} is installed, restart to use it`}</p>
            <p className="text-muted">Running: {update.running}</p>
            {update.canRestart ? (
              <button
                type="button"
                disabled={restarting}
                onClick={() => void restart()}
                className="w-full rounded-md border border-border px-2 py-1.5 hover:bg-muted-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
              >
                {restarting ? 'Restarting...' : 'Restart now'}
              </button>
            ) : (
              <p className="text-muted">This server cannot restart itself: restart app-core yourself, then reload the page.</p>
            )}
            {restartError === undefined ? null : (
              <p role="alert" className="text-danger">
                {restartError}
              </p>
            )}
          </>
        ) : null}
        {update.state === 'update-failed' ? (
          <>
            <p className="font-semibold text-warning-text">{`The update to ${update.latest ?? 'a newer version'} failed`}</p>
            <p>{update.failure?.message}</p>
            {update.failure?.step === undefined ? null : (
              <p className="text-muted">
                Step: <span className="font-mono">{update.failure.step}</span>
              </p>
            )}
            {update.failure?.logFile === undefined ? null : (
              <p className="text-muted">
                Log: <span className="break-all font-mono">{update.failure.logFile}</span>
              </p>
            )}
            <p className="text-muted">{`${update.running} keeps running. The updater tries again at its next check.`}</p>
          </>
        ) : null}
        {update.state === 'applying' ? <p>{`Installing ${update.latest ?? 'a new version'}...`}</p> : null}
        {update.state === 'update-available' ? <p>{`${update.latest} is available: it is installed at the next update check.`}</p> : null}
        {update.state === 'unknown' ? <p>{update.reason}</p> : null}
      </div>
    </Popover>
  );
}
