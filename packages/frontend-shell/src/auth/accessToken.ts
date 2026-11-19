// The access token of the PIN (10 minutes, see the server's auth/tokens.ts), kept in localStorage so every tab of this browser
// uses it. Readable by the scripts of the page: that is why it is short-lived and why the PIN itself is never stored.
export const ACCESS_TOKEN_KEY = 'app-core.access-token';

const listeners = new Set<() => void>();
const notify = (): void => listeners.forEach((listener) => listener());

export function storeAccessToken(token: string, expiresInSeconds: number): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, JSON.stringify({ token, expiresAt: Date.now() + expiresInSeconds * 1000 }));
  notify();
}

// The token, unless it is absent or expired (an expired one is removed).
export function getAccessToken(): string | undefined {
  const raw = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (raw === null) {
    return undefined;
  }
  let stored: { token?: unknown; expiresAt?: unknown } | null = null;
  try {
    stored = JSON.parse(raw) as { token?: unknown; expiresAt?: unknown } | null;
  } catch {
    stored = null;
  }
  if (stored === null || typeof stored.token !== 'string' || typeof stored.expiresAt !== 'number') {
    console.warn(`[shell] localStorage "${ACCESS_TOKEN_KEY}" does not hold a token and its expiry: it was removed, the PIN is asked at the next sensitive action.`);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    return undefined;
  }
  if (stored.expiresAt <= Date.now()) {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    return undefined;
  }
  return stored.token;
}

export function clearAccessToken(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  notify();
}

// Called when a token is stored or cleared in this tab. Returns what stops the listening.
export function onAccessTokenChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
