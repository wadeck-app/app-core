import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_CORE_SHELL_GLOBAL, appFetcher, elevate } from './shell.js';

describe('shell entry (what the shell gives to a dsl-lib component)', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, APP_CORE_SHELL_GLOBAL);
  });

  it('names the global the shell installs', () => {
    expect(APP_CORE_SHELL_GLOBAL).toBe('__APP_CORE_SHELL__');
  });

  it('elevate asks the shell and resolves when the shell does', async () => {
    const shellElevate = vi.fn(async () => undefined);
    Reflect.set(globalThis, APP_CORE_SHELL_GLOBAL, { elevate: shellElevate, fetcher: vi.fn() });
    await expect(elevate()).resolves.toBeUndefined();
    expect(shellElevate).toHaveBeenCalledTimes(1);
  });

  it('elevate rejects with the error of the shell when the PIN is not entered', async () => {
    Reflect.set(globalThis, APP_CORE_SHELL_GLOBAL, {
      elevate: async () => {
        throw new Error('Sensitive action cancelled: PIN not entered');
      },
      fetcher: vi.fn(),
    });
    await expect(elevate()).rejects.toThrow('Sensitive action cancelled: PIN not entered');
  });

  it('appFetcher passes url, params, body and headers to the fetcher of the shell and returns its answer', async () => {
    const fetcher = vi.fn(async () => ({ ok: true }));
    Reflect.set(globalThis, APP_CORE_SHELL_GLOBAL, { elevate: vi.fn(), fetcher });
    const answer = await appFetcher('POST /api/modules/x/send', { a: '1' }, { text: 'hi' }, { 'X-Test': 'y' });
    expect(answer).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith('POST /api/modules/x/send', { a: '1' }, { text: 'hi' }, { 'X-Test': 'y' });
  });

  it('appFetcher passes the errors of the shell through', async () => {
    Reflect.set(globalThis, APP_CORE_SHELL_GLOBAL, {
      elevate: vi.fn(),
      fetcher: async () => {
        throw Object.assign(new Error('nope'), { status: 403 });
      },
    });
    await expect(appFetcher('GET /x')).rejects.toMatchObject({ message: 'nope', status: 403 });
  });

  it('throws a clear error, without any plain fetch, when the shell does not provide it', async () => {
    const plainFetch = vi.fn();
    vi.stubGlobal('fetch', plainFetch);
    try {
      await expect(elevate()).rejects.toThrow('the app-core shell does not provide elevate(): update app-core (app-core-cli update) or run this code inside the shell');
      await expect(appFetcher('GET /x')).rejects.toThrow('the app-core shell does not provide appFetcher(): update app-core (app-core-cli update) or run this code inside the shell');
      expect(plainFetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('names the missing function when the global exists but is incomplete', async () => {
    Reflect.set(globalThis, APP_CORE_SHELL_GLOBAL, { elevate: vi.fn() });
    await expect(appFetcher('GET /x')).rejects.toThrow('the app-core shell does not provide appFetcher()');
  });
});
