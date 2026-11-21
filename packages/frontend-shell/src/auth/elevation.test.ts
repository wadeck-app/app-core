import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetcher } from '../fetcher.js';
import { getAccessToken, storeAccessToken } from './accessToken.js';
import { changePin } from './elevation.js';
import { setPinAsker, type PinAsker } from './pinPrompt.js';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('fetcher: sensitive routes (elevation)', () => {
  let calls: Call[];
  // The server of the test: what each route answers, in order, per "METHOD url".
  let script: Record<string, Array<() => Response>>;

  beforeEach(() => {
    localStorage.clear();
    calls = [];
    script = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const method = init.method ?? 'GET';
        calls.push({ url, method, headers: (init.headers ?? {}) as Record<string, string>, body: init.body === undefined ? undefined : JSON.parse(init.body as string) });
        const next = script[`${method} ${url}`]?.shift();
        if (next === undefined) {
          throw new Error(`the test server has no answer left for ${method} ${url}`);
        }
        return next();
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setPinAsker(undefined);
  });

  const launch = (): Promise<unknown> => fetcher('POST /api/modules/agent/launch', undefined, { prompt: 'go' });
  const needsPin = (): Response => json(401, { error: 'elevation-required', message: 'This action needs the PIN.' });
  const authorizations = (): Array<string | undefined> => calls.filter((c) => c.url === '/api/modules/agent/launch').map((c) => c.headers['Authorization']);

  it('sends the stored access token as a Bearer, to this app only', async () => {
    storeAccessToken('tok.en.1', 600);
    script['POST /api/modules/agent/launch'] = [() => json(200, { ok: 1 })];
    await launch();
    expect(authorizations()).toEqual(['Bearer tok.en.1']);
    script['GET https://elsewhere.example/x'] = [() => json(200, {})];
    await fetcher('GET https://elsewhere.example/x');
    script['GET //elsewhere.example/y'] = [() => json(200, {})];
    await fetcher('GET //elsewhere.example/y');
    expect(calls.slice(1).map((c) => c.headers['Authorization'])).toEqual([undefined, undefined]);
  });

  it('sends no Authorization header without a token', async () => {
    script['POST /api/modules/agent/launch'] = [() => json(200, {})];
    await launch();
    expect(authorizations()).toEqual([undefined]);
  });

  it('on elevation-required refreshes once and repeats the request with the new token', async () => {
    script['POST /api/modules/agent/launch'] = [needsPin, () => json(200, { launched: true })];
    script['POST /api/auth/refresh'] = [() => json(200, { accessToken: 'fresh.tok.en', expiresInSeconds: 600 })];
    expect(await launch()).toEqual({ launched: true });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(['POST /api/modules/agent/launch', 'POST /api/auth/refresh', 'POST /api/modules/agent/launch']);
    expect(calls[1]).toMatchObject({ body: {}, headers: { 'Content-Type': 'application/json' } });
    expect(authorizations()).toEqual([undefined, 'Bearer fresh.tok.en']);
    expect(calls[2]?.body).toEqual({ prompt: 'go' });
    expect(getAccessToken()).toBe('fresh.tok.en');
  });

  it('shares one refresh between requests that fail together', async () => {
    script['POST /api/modules/agent/launch'] = [needsPin, needsPin, () => json(200, { n: 1 }), () => json(200, { n: 2 })];
    script['POST /api/auth/refresh'] = [() => json(200, { accessToken: 'fresh.tok.en', expiresInSeconds: 600 })];
    const results = await Promise.all([launch(), launch()]);
    expect(results).toHaveLength(2);
    expect(calls.filter((c) => c.url === '/api/auth/refresh')).toHaveLength(1);
  });

  it('asks the PIN once for requests that fail together, and repeats them all after it', async () => {
    script['POST /api/modules/agent/launch'] = [needsPin, needsPin, () => json(200, { n: 1 }), () => json(200, { n: 2 })];
    script['POST /api/auth/refresh'] = [() => json(401, { error: 'refresh-required', message: 'PIN needed' })];
    script['POST /api/auth/pin'] = [() => json(200, { accessToken: 'from.pin.tok', expiresInSeconds: 600 })];
    const asker = vi.fn<PinAsker>(async (verify) => (await verify('482915')).ok);
    setPinAsker(asker);
    await Promise.all([launch(), launch()]);
    expect(asker).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c.url === '/api/auth/pin')).toHaveLength(1);
    expect(calls.find((c) => c.url === '/api/auth/pin')?.body).toEqual({ pin: '482915' });
    expect(authorizations().filter((a) => a === 'Bearer from.pin.tok')).toHaveLength(2);
  });

  it('gives the dialog the server message and the wait for a wrong or locked PIN, and lets it try again', async () => {
    script['POST /api/modules/agent/launch'] = [needsPin, () => json(200, { ok: true })];
    script['POST /api/auth/refresh'] = [() => json(401, { error: 'refresh-required', message: 'PIN needed' })];
    script['POST /api/auth/pin'] = [
      () => json(401, { error: 'pin-wrong', message: 'Wrong PIN. 4 tries left before a wait of 1 minute.' }),
      () => json(429, { error: 'pin-locked', retryAfterSeconds: 42, message: 'Too many wrong PINs. Try again in 42 seconds.' }, { 'retry-after': '42' }),
      () => json(200, { accessToken: 'late.tok.en', expiresInSeconds: 600 }),
    ];
    const verdicts: unknown[] = [];
    setPinAsker(async (verify) => {
      for (const pin of ['000000', '000000', '482915']) {
        const verdict = await verify(pin);
        verdicts.push(verdict);
        if (verdict.ok) {
          return true;
        }
      }
      return false;
    });
    await launch();
    expect(verdicts).toEqual([
      { ok: false, message: 'Wrong PIN. 4 tries left before a wait of 1 minute.' },
      { ok: false, message: 'Too many wrong PINs. Try again in 42 seconds.', retryAfterSeconds: 42 },
      { ok: true },
    ]);
  });

  it('rejects the original request with a clear error when the dialog is cancelled', async () => {
    script['POST /api/modules/agent/launch'] = [needsPin];
    script['POST /api/auth/refresh'] = [() => json(401, { error: 'refresh-required', message: 'PIN needed' })];
    setPinAsker(async () => false);
    await expect(launch()).rejects.toThrow('Sensitive action cancelled: PIN not entered');
    expect(calls.map((c) => c.url)).toEqual(['/api/modules/agent/launch', '/api/auth/refresh']);
  });

  it('says so when no dialog is mounted to ask the PIN', async () => {
    script['POST /api/modules/agent/launch'] = [needsPin];
    script['POST /api/auth/refresh'] = [() => json(401, { error: 'refresh-required', message: 'PIN needed' })];
    await expect(launch()).rejects.toThrow(/PIN dialog/);
  });

  const notSet = (): Response => json(403, { error: 'pin-not-set', message: 'No PIN is set yet. Choose one in the dashboard or run "app-core-cli pin set".' });

  it('on pin-not-set opens the choose dialog (no refresh), sets the PIN, and repeats the request with the new token', async () => {
    script['POST /api/modules/agent/launch'] = [notSet, () => json(200, { launched: true })];
    script['POST /api/auth/pin/set'] = [() => json(200, { accessToken: 'chosen.tok.en', expiresInSeconds: 600 })];
    const asker = vi.fn<PinAsker>(async (verify) => (await verify('482915')).ok);
    setPinAsker(asker);
    expect(await launch()).toEqual({ launched: true });
    expect(asker).toHaveBeenCalledTimes(1);
    expect(asker.mock.calls[0]?.[1]).toBe('choose');
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(['POST /api/modules/agent/launch', 'POST /api/auth/pin/set', 'POST /api/modules/agent/launch']);
    expect(calls[1]?.body).toEqual({ pin: '482915' });
    expect(authorizations()).toEqual([undefined, 'Bearer chosen.tok.en']);
    expect(getAccessToken()).toBe('chosen.tok.en');
  });

  it('asks to choose the PIN once for requests that hit pin-not-set together', async () => {
    script['POST /api/modules/agent/launch'] = [notSet, notSet, () => json(200, { n: 1 }), () => json(200, { n: 2 })];
    script['POST /api/auth/pin/set'] = [() => json(200, { accessToken: 'chosen.tok.en', expiresInSeconds: 600 })];
    const asker = vi.fn<PinAsker>(async (verify) => (await verify('482915')).ok);
    setPinAsker(asker);
    await Promise.all([launch(), launch()]);
    expect(asker).toHaveBeenCalledTimes(1);
    expect(authorizations().filter((a) => a === 'Bearer chosen.tok.en')).toHaveLength(2);
  });

  it('gives the dialog the server error of set (too short, already set) and lets it try again', async () => {
    script['POST /api/modules/agent/launch'] = [notSet, () => json(200, { ok: true })];
    script['POST /api/auth/pin/set'] = [
      () => json(400, { error: 'pin-invalid', message: 'The PIN must have at least 6 characters (got 3). Choose a longer one.' }),
      () => json(409, { error: 'pin-already-set', message: 'A PIN is already set, and it is not replaced from here.' }),
      () => json(200, { accessToken: 'chosen.tok.en', expiresInSeconds: 600 }),
    ];
    const verdicts: unknown[] = [];
    setPinAsker(async (verify) => {
      for (const pin of ['123', '123456', '123456']) {
        const verdict = await verify(pin);
        verdicts.push(verdict);
        if (verdict.ok) {
          return true;
        }
      }
      return false;
    });
    await launch();
    expect(verdicts).toEqual([
      { ok: false, message: 'The PIN must have at least 6 characters (got 3). Choose a longer one.' },
      { ok: false, message: 'A PIN is already set, and it is not replaced from here.' },
      { ok: true },
    ]);
  });

  it('rejects with a clear error when the choose dialog is cancelled, and when none is mounted', async () => {
    script['POST /api/modules/agent/launch'] = [notSet, notSet];
    setPinAsker(async () => false);
    await expect(launch()).rejects.toThrow('Sensitive action cancelled: no PIN chosen');
    setPinAsker(undefined);
    await expect(launch()).rejects.toThrow(/PIN dialog/);
  });

  it('does not loop: pin-not-set again after the PIN was chosen is an error with the server message', async () => {
    script['POST /api/modules/agent/launch'] = [notSet, notSet];
    script['POST /api/auth/pin/set'] = [() => json(200, { accessToken: 'chosen.tok.en', expiresInSeconds: 600 })];
    setPinAsker(async (verify) => (await verify('482915')).ok);
    await expect(launch()).rejects.toThrow('No PIN is set yet.');
    expect(calls.filter((c) => c.url === '/api/modules/agent/launch')).toHaveLength(2);
  });

  it('changePin sends both PINs and keeps the new session token; a wrong or locked current PIN is a verdict, not a throw', async () => {
    script['POST /api/auth/pin/change'] = [
      () => json(401, { error: 'pin-wrong', message: 'Wrong PIN. 4 tries left before a wait of 1 minute.' }),
      () => json(429, { error: 'pin-locked', retryAfterSeconds: 42, message: 'Too many wrong PINs. Try again in 42 seconds.' }),
      () => json(400, { error: 'pin-unchanged', message: 'The new PIN is the same as the current one.' }),
      () => json(200, { accessToken: 'changed.tok.en', expiresInSeconds: 600 }),
    ];
    expect(await changePin('000000', '999888')).toEqual({ ok: false, message: 'Wrong PIN. 4 tries left before a wait of 1 minute.' });
    expect(await changePin('000000', '999888')).toEqual({ ok: false, message: 'Too many wrong PINs. Try again in 42 seconds.', retryAfterSeconds: 42 });
    expect(await changePin('482915', '482915')).toEqual({ ok: false, message: 'The new PIN is the same as the current one.' });
    expect(await changePin('482915', '999888')).toEqual({ ok: true });
    expect(calls[3]?.body).toEqual({ currentPin: '482915', newPin: '999888' });
    expect(getAccessToken()).toBe('changed.tok.en');
  });

  it('changePin throws the server message for anything that is not about the PINs typed (no PIN set, damaged file)', async () => {
    script['POST /api/auth/pin/change'] = [notSet];
    await expect(changePin('482915', '999888')).rejects.toThrow('No PIN is set yet.');
  });

  it('never loops: a second elevation-required after the repeat is an error', async () => {
    script['POST /api/modules/agent/launch'] = [needsPin, needsPin];
    script['POST /api/auth/refresh'] = [() => json(200, { accessToken: 'fresh.tok.en', expiresInSeconds: 600 })];
    await expect(launch()).rejects.toThrow('This action needs the PIN.');
    expect(calls.filter((c) => c.url === '/api/modules/agent/launch')).toHaveLength(2);
    expect(calls.filter((c) => c.url === '/api/auth/refresh')).toHaveLength(1);
  });

  it('does not start an elevation for a 401 that is not elevation-required', async () => {
    script['POST /api/modules/agent/launch'] = [() => json(401, { error: 'nope', message: 'Not yours.' })];
    await expect(launch()).rejects.toThrow('Not yours.');
    expect(calls).toHaveLength(1);
  });

  it('reports a refresh that fails for another reason, instead of asking the PIN', async () => {
    script['POST /api/modules/agent/launch'] = [needsPin];
    script['POST /api/auth/refresh'] = [() => json(500, { message: 'auth-sessions.json is not valid. Delete it.' })];
    const asker = vi.fn<PinAsker>(async () => true);
    setPinAsker(asker);
    await expect(launch()).rejects.toThrow('auth-sessions.json is not valid. Delete it.');
    expect(asker).not.toHaveBeenCalled();
  });
});
