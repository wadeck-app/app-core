import { getErrorMessage } from '@wadeck-app/app-core-server/errors';

// A server that stays up for days would only see an update at its next start: it starts the updater again every 6 hours. The
// updater's own 30 minute cache turns a call that comes too soon into a file read.
export const RECHECK_INTERVAL_MS = 6 * 3600 * 1000;

export interface PeriodicUpdateOptions {
  // False with `--no-update` (or APP_CORE_CLI_NO_UPDATE=1): no timer at all.
  enabled: boolean;
  // The same call as the one made at start: spawns the detached updater.
  schedule: () => void;
}

// Returns the function that stops it.
export function startPeriodicUpdate({ enabled, schedule }: PeriodicUpdateOptions): () => void {
  if (!enabled) {
    return () => undefined;
  }
  const timer = setInterval(() => {
    try {
      schedule();
    } catch (err) {
      process.stderr.write(`app-core-cli serve: the periodic update check could not start (${getErrorMessage(err)}); the next try is in 6 hours.\n`);
    }
  }, RECHECK_INTERVAL_MS);
  // The server's own listener keeps the process alive; this timer must not.
  timer.unref();
  return () => clearInterval(timer);
}
