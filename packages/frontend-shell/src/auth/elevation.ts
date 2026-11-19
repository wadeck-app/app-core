import { storeAccessToken } from './accessToken.js';
import { askForPin, type PinVerdict } from './pinPrompt.js';

export const CANCELLED_MESSAGE = 'Sensitive action cancelled: PIN not entered';

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

async function verifyPin(pin: string): Promise<PinVerdict> {
  const { status, data } = await postJson('/api/auth/pin', { pin });
  if (status === 200) {
    keep('/api/auth/pin', status, data);
    return { ok: true };
  }
  if (status === 401 || status === 429) {
    return { ok: false, message: messageOf('/api/auth/pin', status, data), ...(typeof data?.retryAfterSeconds === 'number' ? { retryAfterSeconds: data.retryAfterSeconds } : {}) };
  }
  // pin-not-set (403), a damaged auth file (500)...: not something to retype the PIN for.
  throw Object.assign(new Error(messageOf('/api/auth/pin', status, data)), { status });
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

// Gets a valid access token: from the refresh cookie, else by asking the PIN. One run for every request that needs it at the same
// moment (one refresh, one dialog). Rejects when the PIN is not entered.
export function elevate(): Promise<void> {
  inFlight ??= elevateOnce().finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}
