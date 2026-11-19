import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_TOKEN_KEY, clearAccessToken, getAccessToken, onAccessTokenChange, storeAccessToken } from './accessToken.js';

describe('stored access token', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
  });
  afterEach(() => vi.useRealTimers());

  it('is kept in localStorage as the token and its expiry', () => {
    storeAccessToken('abc.def.ghi', 600);
    expect(ACCESS_TOKEN_KEY).toBe('app-core.access-token');
    expect(JSON.parse(localStorage.getItem(ACCESS_TOKEN_KEY) ?? 'null')).toEqual({ token: 'abc.def.ghi', expiresAt: 1_700_000_600_000 });
    expect(getAccessToken()).toBe('abc.def.ghi');
  });

  it('is not given once expired, and is removed', () => {
    storeAccessToken('abc.def.ghi', 600);
    vi.setSystemTime(1_700_000_600_000);
    expect(getAccessToken()).toBeUndefined();
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
  });

  it('says what is wrong with a stored value that is not a token, and removes it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    localStorage.setItem(ACCESS_TOKEN_KEY, 'not json');
    expect(getAccessToken()).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(ACCESS_TOKEN_KEY));
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    warn.mockRestore();
  });

  it('tells listeners when it is stored and cleared', () => {
    const seen: Array<string | undefined> = [];
    const stop = onAccessTokenChange(() => seen.push(getAccessToken()));
    storeAccessToken('t', 600);
    clearAccessToken();
    stop();
    storeAccessToken('u', 600);
    expect(seen).toEqual(['t', undefined]);
  });
});
