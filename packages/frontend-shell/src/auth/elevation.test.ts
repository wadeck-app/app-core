import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetcher } from '../fetcher.js';
import { getAccessToken, storeAccessToken } from './accessToken.js';
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

  it('throws the server message on pin-not-set, with no refresh and no dialog', async () => {
    script['POST /api/modules/agent/launch'] = [() => json(403, { error: 'pin-not-set', message: 'Run "app-core-cli pin set" to choose the PIN that unlocks sensitive actions.' })];
    const err = await launch().catch((e: Error & { status?: number }) => e);
    expect((err as Error).message).toBe('Run "app-core-cli pin set" to choose the PIN that unlocks sensitive actions.');
    expect((err as { status?: number }).status).toBe(403);
    expect(calls).toHaveLength(1);
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
