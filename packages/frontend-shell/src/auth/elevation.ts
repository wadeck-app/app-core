import { storeAccessToken } from './accessToken.js';
import { askForPin, type PinVerdict } from './pinPrompt.js';

export const CANCELLED_MESSAGE = 'Sensitive action cancelled: PIN not entered';
export const CHOOSE_CANCELLED_MESSAGE = 'Sensitive action cancelled: no PIN chosen';

interface Answer {
  accessToken?: unknown;
  expiresInSeconds?: unknown;
  error?: unknown;
  message?: unknown;
  retryAfterSeconds?: unknown;
}

async function postJson(path: string, body: unknown): Promise<{ status: number; data: Answer | undefined }> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  let data: Answer | undefined;
  try {
    data = text.trim() === '' ? undefined : (JSON.parse(text) as Answer);
  } catch {
    data = undefined;
  }
  return { status: res.status, data };
}

function keep(path: string, status: number, data: Answer | undefined): void {
  if (typeof data?.accessToken !== 'string' || typeof data.expiresInSeconds !== 'number') {
    throw new Error(`POST ${path} answered ${status} without an access token: the server and this page do not match. Reload the page.`);
  }
  storeAccessToken(data.accessToken, data.expiresInSeconds);
}

const messageOf = (path: string, status: number, data: Answer | undefined): string =>
  typeof data?.message === 'string' ? data.message : `POST ${path} answered ${status} with no message: app-core may be restarting or down, retry in a few seconds.`;

// Sends a PIN route's body. 200 stores the session token; the statuses in `retryable` are about what was typed (a verdict the dialog
// shows in place); anything else (pin-not-set, a damaged auth file...) is not something to retype a PIN for: it throws.
async function sendPin(path: string, body: unknown, retryable: number[]): Promise<PinVerdict> {
  const { status, data } = await postJson(path, body);
  if (status === 200) {
    keep(path, status, data);
    return { ok: true };
  }
  if (retryable.includes(status)) {
    return { ok: false, message: messageOf(path, status, data), ...(typeof data?.retryAfterSeconds === 'number' ? { retryAfterSeconds: data.retryAfterSeconds } : {}) };
  }
  throw Object.assign(new Error(messageOf(path, status, data)), { status });
}

const verifyPin = (pin: string): Promise<PinVerdict> => sendPin('/api/auth/pin', { pin }, [401, 429]);

// 400: too short or too long; 409: a PIN was chosen meanwhile (cancel, then repeat the action to enter it).
const setFirstPin = (pin: string): Promise<PinVerdict> => sendPin('/api/auth/pin/set', { pin }, [400, 409]);

// The "Change PIN" form: the current PIN is checked by the server with the lockout of the login. 401 wrong, 429 locked, 400 the new
// one is refused (too short, same as the current one).
export const changePin = (currentPin: string, newPin: string): Promise<PinVerdict> => sendPin('/api/auth/pin/change', { currentPin, newPin }, [400, 401, 429]);

async function chooseOnce(): Promise<void> {
  if (!(await askForPin(setFirstPin, 'choose'))) {
    throw new Error(CHOOSE_CANCELLED_MESSAGE);
  }
}

async function elevateOnce(): Promise<void> {
  const refreshed = await postJson('/api/auth/refresh', {});
  if (refreshed.status === 200) {
    keep('/api/auth/refresh', refreshed.status, refreshed.data);
    return;
  }
  if (refreshed.status !== 401 || refreshed.data?.error !== 'refresh-required') {
    throw Object.assign(new Error(messageOf('/api/auth/refresh', refreshed.status, refreshed.data)), { status: refreshed.status });
  }
  if (!(await askForPin(verifyPin))) {
    throw new Error(CANCELLED_MESSAGE);
  }
}

let inFlight: Promise<void> | undefined;

// One run (one refresh, one dialog) for every request that needs it at the same moment.
const shared = (run: () => Promise<void>): Promise<void> => {
  inFlight ??= run().finally(() => {
    inFlight = undefined;
  });
  return inFlight;
};

// Gets a valid access token: from the refresh cookie, else by asking the PIN. Rejects when the PIN is not entered.
export const elevate = (): Promise<void> => shared(elevateOnce);

// No PIN exists yet (a sensitive route answered 403 pin-not-set): opens the "Choose a PIN" dialog; the server unlocks the new
// session at once. Rejects when the dialog is cancelled.
export const choosePin = (): Promise<void> => shared(chooseOnce);
