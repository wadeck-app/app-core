import { getErrorMessage } from './errors.js';

export const HOOK_TIMEOUT_ENV = 'APP_CORE_HOOK_TIMEOUT_MS';
export const DEFAULT_HOOK_TIMEOUT_MS = 30_000;

// Timeout for importing a module's backend and for running setup and each lifecycle hook. Read once at
// startup: an invalid value is an error naming the variable, never a silent default.
export function resolveHookTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[HOOK_TIMEOUT_ENV];
  if (raw === undefined || raw === '') {
    return DEFAULT_HOOK_TIMEOUT_MS;
  }
  if (!/^[1-9]\d*$/.test(raw.trim())) {
    throw new Error(`${HOOK_TIMEOUT_ENV}="${raw}" is not a positive integer number of milliseconds. Set it to e.g. ${DEFAULT_HOOK_TIMEOUT_MS}, or unset it to use the default.`);
  }
  return Number(raw.trim());
}

export class StepTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(
      `timed out after ${timeoutMs} ms. A timed-out step cannot be cancelled: it may still be running in the background. ` +
        `Make it finish faster, or raise ${HOOK_TIMEOUT_ENV} if it legitimately needs longer.`,
    );
    this.name = 'StepTimeoutError';
  }
}

// Rejects with StepTimeoutError when `fn` has not settled after `ms`. `what` only labels the stderr line
// written if the step fails later, after the caller already gave up on it.
export async function runWithTimeout<T>(what: string, ms: number, fn: () => T | Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  let timedOut = false;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new StepTimeoutError(ms));
    }, ms);
  });
  const work = Promise.resolve().then(fn);
  work.catch((err: unknown) => {
    if (timedOut) {
      process.stderr.write(`[app-core] ${what} failed after it had timed out: ${getErrorMessage(err)}\n`);
    }
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
