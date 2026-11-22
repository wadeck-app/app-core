import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildServer, type AppCoreServer } from '../src/server.js';
import { setPin, authFilePath, PIN_NOT_SET_MESSAGE } from '../src/auth/pin.js';
import { REFRESH_WINDOW_MS, secretFilePath } from '../src/auth/tokens.js';
import { createModuleContext } from '../src/moduleContext.js';

const PIN = '482915';
const COOKIE_FLAGS = 'HttpOnly; SameSite=Strict; Path=/api/auth';

describe('auth routes and sensitive routes', () => {
  let configDir: string;
  let app: AppCoreServer;
  const clock = { now: 1_700_000_000_000 };
  const now = (): number => clock.now;

  const start = async (): Promise<AppCoreServer> => {
    const built = await buildServer({ configDir, publicDir: path.join(configDir, 'no-public'), authClock: now });
    const ctx = createModuleContext('fx', built.manager.routeRegistry, path.join(configDir, 'data'));
    ctx.registerRoute('POST', '/launch', () => ({ launched: true }), { effect: 'sensitive' });
    ctx.registerRoute('GET', '/secret/:id', (req) => ({ secret: req.params['id'] }), { effect: 'sensitive' });
    ctx.registerRoute('POST', '/save', () => ({ saved: true }));
    ctx.registerRoute('GET', '/open', () => ({ open: true }));
    return built;
  };

  beforeEach(async () => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-auth-routes-'));
    clock.now = 1_700_000_000_000;
    app = await start();
  });
  afterEach(async () => {
    await app.server.close();
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  // What the shell's own calls carry: the first PIN is only taken from a request that looks like the dashboard's (D12).
  const SHELL_HEADERS = { origin: 'http://127.0.0.1:4850' };
  const post = (url: string, payload: unknown = {}, headers: Record<string, string> = {}) =>
    app.server.inject({ method: 'POST', url, payload: payload as object, headers: { ...SHELL_HEADERS, ...headers } });
  const login = async (pin = PIN) => {
    const res = await post('/api/auth/pin', { pin });
    const cookie = String(res.headers['set-cookie'] ?? '').split(';')[0] ?? '';
    return { res, cookie, token: res.statusCode === 200 ? (res.json() as { accessToken: string }).accessToken : '' };
  };
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  describe('no PIN set', () => {
    it('answers 403 pin-not-set to a sensitive route, naming the command', async () => {
      const res = await post('/api/modules/fx/launch');
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: 'pin-not-set', message: PIN_NOT_SET_MESSAGE });
    });

    it('answers 403 pin-not-set even with a Bearer header', async () => {
      expect((await post('/api/modules/fx/launch', {}, bearer('anything'))).statusCode).toBe(403);
    });

    it('refuses to log in with the same message, and reports pinSet false', async () => {
      const res = await post('/api/auth/pin', { pin: PIN });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ error: 'pin-not-set' });
      const status = await app.server.inject({ method: 'GET', url: '/api/auth/status' });
      expect(status.json()).toMatchObject({ pinSet: false, locked: false, elevated: false });
    });

    it('does not touch routes that are not sensitive', async () => {
      expect((await post('/api/modules/fx/save')).statusCode).toBe(200);
      expect((await app.server.inject({ method: 'GET', url: '/api/modules/fx/open' })).statusCode).toBe(200);
    });

    it('pin-not-set says the dashboard can choose the PIN and keeps the CLI as the alternative', async () => {
      const message = ((await post('/api/modules/fx/launch')).json() as { message: string }).message;
      expect(message).toMatch(/dashboard/);
      expect(message).toContain('app-core-cli pin set');
    });

    it('POST /api/auth/pin/set chooses the PIN and unlocks at once: cookie, access token, the sensitive route answers', async () => {
      const res = await post('/api/auth/pin/set', { pin: PIN });
      expect(res.statusCode).toBe(200);
      expect(res.headers['set-cookie']).toMatch(new RegExp(`^app-core-refresh=[A-Za-z0-9_-]{43}; ${COOKIE_FLAGS}; Max-Age=604800$`));
      const { accessToken, expiresInSeconds } = res.json() as { accessToken: string; expiresInSeconds: number };
      expect(expiresInSeconds).toBe(600);
      expect((await post('/api/modules/fx/launch', {}, bearer(accessToken))).statusCode).toBe(200);
      expect(res.body).not.toContain(PIN);
      expect(fs.readFileSync(authFilePath(configDir), 'utf8')).not.toContain(PIN);
      // The PIN works for a normal login afterwards.
      expect((await login()).res.statusCode).toBe(200);
      const cookie = String(res.headers['set-cookie']).split(';')[0] ?? '';
      expect((await app.server.inject({ method: 'GET', url: '/api/auth/status', headers: { cookie } })).json()).toMatchObject({ pinSet: true, elevated: true });
    });

    describe('the first PIN needs the shell headers (D12)', () => {
      const setBare = (headers: Record<string, string> = {}) => app.server.inject({ method: 'POST', url: '/api/auth/pin/set', payload: { pin: PIN }, headers });

      it('is refused without Origin nor Sec-Fetch-Site: 403 browser-required, nothing written', async () => {
        const res = await setBare();
        expect(res.statusCode).toBe(403);
        expect(res.json()).toEqual({
          error: 'browser-required',
          message: 'The first PIN is chosen in the app-core dashboard in your browser, or with "app-core-cli pin set" in a terminal.',
        });
        expect(res.headers['set-cookie']).toBeUndefined();
        expect(fs.existsSync(authFilePath(configDir))).toBe(false);
      });

      it('is accepted with an Origin this server answers to (also the Vite dev proxy: its Host and Origin stay on localhost:5173)', async () => {
        for (const origin of ['http://127.0.0.1:4850', 'http://localhost:4850', 'http://localhost:5173', 'http://[::1]:4850']) {
          expect((await setBare({ origin })).statusCode, origin).toBe(200);
          fs.rmSync(authFilePath(configDir));
        }
      });

      it('is accepted with Sec-Fetch-Site: same-origin', async () => {
        expect((await setBare({ 'sec-fetch-site': 'same-origin' })).statusCode).toBe(200);
      });

      it('is refused with a foreign Origin (by the request guard), or with Sec-Fetch-Site none / same-site, nothing written', async () => {
        expect((await setBare({ origin: 'http://evil.example' })).statusCode).toBe(403);
        expect((await setBare({ 'sec-fetch-site': 'none' })).json()).toMatchObject({ error: 'browser-required' });
        expect((await setBare({ 'sec-fetch-site': 'same-site' })).statusCode).toBe(403);
        expect(fs.existsSync(authFilePath(configDir))).toBe(false);
      });

      it('does not apply to the other auth routes (a wrong login without headers is a 401, not browser-required)', async () => {
        await setPin(configDir, PIN, now);
        const res = await app.server.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: 'wrong1' } });
        expect(res.statusCode).toBe(401);
      });
    });

    it('set refuses a PIN that is too short, too long or not a text (400), and writes nothing', async () => {
      const short = await post('/api/auth/pin/set', { pin: '123' });
      expect(short.statusCode).toBe(400);
      expect(short.json()).toMatchObject({ error: 'pin-invalid' });
      expect((short.json() as { message: string }).message).toMatch(/at least 4 characters/);
      for (const body of [{}, { pin: 123456 }, { pin: 'x'.repeat(5000) }, { pin: 'x'.repeat(257) }]) {
        expect((await post('/api/auth/pin/set', body)).statusCode).toBe(400);
      }
      // 13 characters is the first one too long to choose; 12 is accepted (checked in pin.test.ts).
      const long = await post('/api/auth/pin/set', { pin: 'x'.repeat(13) });
      expect(long.statusCode).toBe(400);
      expect((long.json() as { message: string }).message).toMatch(/at most 12 characters \(got 13\)/);
      expect(fs.existsSync(authFilePath(configDir))).toBe(false);
    });

    it('two simultaneous set calls: exactly one succeeds, the others get 409 and the winner PIN is the one stored', async () => {
      const pins = ['111111', '222222', '333333', '444444'];
      const results = await Promise.all(pins.map((pin) => post('/api/auth/pin/set', { pin })));
      expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409, 409, 409]);
      const winnerIndex = results.findIndex((r) => r.statusCode === 200);
      expect((await login(pins[winnerIndex])).res.statusCode).toBe(200);
      for (const [i, pin] of pins.entries()) {
        if (i !== winnerIndex) {
          expect((await login(pin)).res.statusCode).toBe(401);
        }
      }
    });

    it('set and change need Content-Type application/json (415) and go through the request guard', async () => {
      for (const url of ['/api/auth/pin/set', '/api/auth/pin/change']) {
        expect((await app.server.inject({ method: 'POST', url, headers: { 'content-type': 'text/plain' }, payload: 'x' })).statusCode).toBe(415);
        expect((await app.server.inject({ method: 'POST', url })).statusCode).toBe(415);
        expect((await post(url, { pin: PIN, currentPin: PIN, newPin: '999888' }, { 'sec-fetch-site': 'cross-site' })).statusCode).toBe(403);
        expect((await post(url, { pin: PIN, currentPin: PIN, newPin: '999888' }, { origin: 'https://evil.example' })).statusCode).toBe(403);
      }
      expect(fs.existsSync(authFilePath(configDir))).toBe(false);
    });

    it('change without a PIN answers 403 pin-not-set', async () => {
      const res = await post('/api/auth/pin/change', { currentPin: PIN, newPin: '999888' });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ error: 'pin-not-set' });
    });

    it('status gives the reset hint: the absolute path of auth.json and one sentence', async () => {
      const hint = ((await app.server.inject({ method: 'GET', url: '/api/auth/status' })).json() as { resetHint: { files: string[]; instruction: string } }).resetHint;
      expect(hint.files).toEqual([authFilePath(configDir)]);
      expect(path.isAbsolute(hint.files[0] ?? '')).toBe(true);
      expect(hint.instruction).toMatch(/Delete/);
      expect(hint.instruction.split('. ').length).toBeLessThanOrEqual(2);
    });
  });

  describe('reset by hand (deleting the files of resetHint while the server runs)', () => {
    it('returns to "no PIN set" without a restart, and the old sessions and tokens do not come back after a new PIN', async () => {
      const first = await post('/api/auth/pin/set', { pin: PIN });
      const oldCookie = String(first.headers['set-cookie']).split(';')[0] ?? '';
      const oldToken = (first.json() as { accessToken: string }).accessToken;
      const status = (await app.server.inject({ method: 'GET', url: '/api/auth/status', headers: { cookie: oldCookie } })).json() as { resetHint: { files: string[] } };
      expect(status.resetHint.files).toEqual([authFilePath(configDir)]);
      for (const file of status.resetHint.files) {
        fs.rmSync(file);
      }
      const after = await app.server.inject({ method: 'GET', url: '/api/auth/status', headers: { cookie: oldCookie } });
      expect(after.json()).toMatchObject({ pinSet: false, elevated: false });
      expect((await post('/api/modules/fx/launch', {}, bearer(oldToken))).json()).toMatchObject({ error: 'pin-not-set' });
      expect((await post('/api/auth/pin', { pin: PIN })).statusCode).toBe(403);
      // Choose again: the old session and the old access token, still unexpired, stay refused.
      const second = await post('/api/auth/pin/set', { pin: '999888' });
      expect(second.statusCode).toBe(200);
      expect((await post('/api/modules/fx/launch', {}, bearer(oldToken))).statusCode).toBe(401);
      expect((await post('/api/auth/refresh', {}, { cookie: oldCookie })).statusCode).toBe(401);
      expect((await post('/api/modules/fx/launch', {}, bearer((second.json() as { accessToken: string }).accessToken))).statusCode).toBe(200);
    });
  });

  describe('a damaged auth.json', () => {
    it('answers a clear 500 on /api/auth/status and on a sensitive route, saying to delete or repair the file', async () => {
      fs.writeFileSync(authFilePath(configDir), '{not json');
      const status = await app.server.inject({ method: 'GET', url: '/api/auth/status' });
      expect(status.statusCode).toBe(500);
      expect((status.json() as { message: string }).message).toMatch(/auth.json.*not valid.*delete.*repair/is);
      const sensitive = await post('/api/modules/fx/launch');
      expect(sensitive.statusCode).toBe(500);
      expect((sensitive.json() as { message: string }).message).toMatch(/auth.json.*not valid.*delete.*repair/is);
    });
  });

  describe('PIN set', () => {
    beforeEach(async () => {
      await setPin(configDir, PIN, now);
    });

    it('answers 401 elevation-required without a token, with a bad one, and with a non-Bearer scheme', async () => {
      for (const headers of [{}, bearer('nope'), bearer(''), { authorization: 'Basic abc' }, { authorization: 'Bearer' }]) {
        const res = await post('/api/modules/fx/launch', {}, headers);
        expect(res.statusCode).toBe(401);
        expect(res.json()).toMatchObject({ error: 'elevation-required' });
        expect((res.json() as { message: string }).message).toMatch(/PIN/);
      }
      expect((await app.server.inject({ method: 'GET', url: '/api/modules/fx/secret/7' })).statusCode).toBe(401);
    });

    it('leaves ordinary write routes alone (no header gate in this delivery)', async () => {
      expect((await post('/api/modules/fx/save')).statusCode).toBe(200);
    });

    it('logs in with the right PIN: cookie flags, an access token, and the route answers with it', async () => {
      const { res, token } = await login();
      expect(res.statusCode).toBe(200);
      expect(res.headers['set-cookie']).toMatch(new RegExp(`^app-core-refresh=[A-Za-z0-9_-]{43}; ${COOKIE_FLAGS}; Max-Age=604800$`));
      expect(res.json()).toEqual({ accessToken: token, expiresInSeconds: 600 });
      const launched = await post('/api/modules/fx/launch', {}, bearer(token));
      expect(launched.statusCode).toBe(200);
      expect(launched.json()).toEqual({ launched: true });
      const secret = await app.server.inject({ method: 'GET', url: '/api/modules/fx/secret/42', headers: bearer(token) });
      expect(secret.json()).toEqual({ secret: '42' });
    });

    it('refuses a wrong PIN with the tries left, and a body without a PIN with 400', async () => {
      const wrong = await post('/api/auth/pin', { pin: '000000' });
      expect(wrong.statusCode).toBe(401);
      expect(wrong.json()).toMatchObject({ error: 'pin-wrong', triesLeft: 4 });
      expect(wrong.headers['set-cookie']).toBeUndefined();
      expect((await post('/api/auth/pin', {})).statusCode).toBe(400);
      expect((await post('/api/auth/pin', { pin: 123456 })).statusCode).toBe(400);
      expect((await post('/api/auth/pin', { pin: 'x'.repeat(5000) })).statusCode).toBe(400);
    });

    it('locks after 5 wrong PINs (429, Retry-After), refuses even the right one, then accepts it once the wait ends', async () => {
      for (let i = 0; i < 4; i++) {
        expect((await post('/api/auth/pin', { pin: '000000' })).statusCode).toBe(401);
      }
      const fifth = await post('/api/auth/pin', { pin: '000000' });
      expect(fifth.statusCode).toBe(429);
      expect(fifth.headers['retry-after']).toBe('60');
      expect(fifth.json()).toMatchObject({ error: 'pin-locked', retryAfterSeconds: 60 });
      clock.now += 25_000;
      const during = await post('/api/auth/pin', { pin: PIN });
      expect(during.statusCode).toBe(429);
      expect(during.headers['retry-after']).toBe('35');
      expect(during.headers['set-cookie']).toBeUndefined();
      expect((await app.server.inject({ method: 'GET', url: '/api/auth/status' })).json()).toMatchObject({ locked: true });
      clock.now += 36_000;
      expect((await login()).res.statusCode).toBe(200);
    });

    it('does not let parallel guesses slip past the lock', async () => {
      const results = await Promise.all(Array.from({ length: 9 }, () => post('/api/auth/pin', { pin: '000000' })));
      const codes = results.map((r) => r.statusCode).sort();
      expect(codes).toEqual([401, 401, 401, 401, 429, 429, 429, 429, 429]);
    });

    it('requires Content-Type application/json on every POST of /api/auth (415)', async () => {
      for (const url of ['/api/auth/pin', '/api/auth/refresh', '/api/auth/logout']) {
        const res = await app.server.inject({ method: 'POST', url, headers: { 'content-type': 'text/plain' }, payload: 'pin=1' });
        expect(res.statusCode).toBe(415);
        const bare = await app.server.inject({ method: 'POST', url });
        expect(bare.statusCode).toBe(415);
        expect(bare.json()).toMatchObject({ error: 'unsupported-media-type' });
      }
    });

    it('goes through the request guard: a cross-site or foreign-origin POST is refused', async () => {
      expect((await post('/api/auth/pin', { pin: PIN }, { 'sec-fetch-site': 'cross-site' })).statusCode).toBe(403);
      expect((await post('/api/auth/pin', { pin: PIN }, { origin: 'https://evil.example' })).statusCode).toBe(403);
      expect((await post('/api/auth/logout', {}, { origin: 'https://evil.example' })).statusCode).toBe(403);
    });

    it('refreshes with the cookie: a new access token, the cookie set again, the expiry extended', async () => {
      const { cookie } = await login();
      clock.now += 6 * 24 * 3600 * 1000;
      const first = await post('/api/auth/refresh', {}, { cookie });
      expect(first.statusCode).toBe(200);
      expect(first.headers['set-cookie']).toBe(`${cookie}; ${COOKIE_FLAGS}; Max-Age=604800`);
      const { accessToken, expiresInSeconds } = first.json() as { accessToken: string; expiresInSeconds: number };
      expect(expiresInSeconds).toBe(600);
      expect((await post('/api/modules/fx/launch', {}, bearer(accessToken))).statusCode).toBe(200);
      // Six more days: the original 7 days are over, the extension keeps it alive.
      clock.now += 6 * 24 * 3600 * 1000;
      expect((await post('/api/auth/refresh', {}, { cookie })).statusCode).toBe(200);
    });

    it('answers 401 refresh-required, with the fix, when the cookie is absent, unknown or expired', async () => {
      const { cookie } = await login();
      for (const headers of [{}, { cookie: 'app-core-refresh=nope' }, { cookie: 'other=1' }]) {
        const res = await post('/api/auth/refresh', {}, headers);
        expect(res.statusCode).toBe(401);
        expect(res.json()).toMatchObject({ error: 'refresh-required' });
        expect((res.json() as { message: string }).message).toMatch(/PIN/);
      }
      clock.now += REFRESH_WINDOW_MS + 1000;
      expect((await post('/api/auth/refresh', {}, { cookie })).json()).toMatchObject({ error: 'refresh-required' });
    });

    it('logout without a refresh cookie does not revoke anybody: 200 loggedOut false, access tokens stay valid', async () => {
      const { token } = await login();
      for (const headers of [{}, { cookie: 'app-core-refresh=not-a-session' }]) {
        const res = await post('/api/auth/logout', {}, headers);
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ loggedOut: false });
        expect((res.json() as { message: string }).message).toMatch(/no valid session/i);
      }
      expect((await post('/api/modules/fx/launch', {}, bearer(token))).statusCode).toBe(200);
    });

    it('logout: 200 loggedOut true, cookie cleared, the old access token refused at once, refresh refused', async () => {
      const { cookie, token } = await login();
      const res = await post('/api/auth/logout', {}, { cookie });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ loggedOut: true });
      expect(res.headers['set-cookie']).toBe(`app-core-refresh=; ${COOKIE_FLAGS}; Max-Age=0`);
      expect((await post('/api/modules/fx/launch', {}, bearer(token))).statusCode).toBe(401);
      expect((await post('/api/auth/refresh', {}, { cookie })).statusCode).toBe(401);
      expect((await app.server.inject({ method: 'GET', url: '/api/auth/status', headers: { cookie } })).json()).toMatchObject({ elevated: false });
    });

    it('status: elevated only with a live refresh cookie, and it never returns a secret', async () => {
      const { cookie } = await login();
      const status = await app.server.inject({ method: 'GET', url: '/api/auth/status', headers: { cookie } });
      expect(status.json()).toEqual({ pinSet: true, locked: false, elevated: true, resetHint: expect.any(Object), minPinLength: 4, maxPinLength: 12, registerProtection: 'warn' });
      expect((await app.server.inject({ method: 'GET', url: '/api/auth/status' })).json()).toEqual({ pinSet: true, locked: false, elevated: false, resetHint: expect.any(Object), minPinLength: 4, maxPinLength: 12, registerProtection: 'warn' });
    });

    it('a new PIN (the CLI) logs everyone out: refresh and old access tokens are refused', async () => {
      const { cookie, token } = await login();
      await setPin(configDir, '999888', now);
      expect((await post('/api/modules/fx/launch', {}, bearer(token))).statusCode).toBe(401);
      expect((await post('/api/auth/refresh', {}, { cookie })).statusCode).toBe(401);
      expect((await login(PIN)).res.statusCode).toBe(401);
      expect((await login('999888')).res.statusCode).toBe(200);
    });

    const change = (currentPin: unknown, newPin: unknown, headers: Record<string, string> = {}) => post('/api/auth/pin/change', { currentPin, newPin }, headers);
    const NEW_PIN = '999888';

    it('set when a PIN exists: 409 pin-already-set pointing to change, nothing changes', async () => {
      const before = fs.readFileSync(authFilePath(configDir), 'utf8');
      const res = await post('/api/auth/pin/set', { pin: NEW_PIN });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: 'pin-already-set' });
      expect((res.json() as { message: string }).message).toMatch(/change/i);
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(fs.readFileSync(authFilePath(configDir), 'utf8')).toBe(before);
      expect((await login()).res.statusCode).toBe(200);
      expect((await login(NEW_PIN)).res.statusCode).toBe(401);
    });

    it('change with a wrong current PIN: 401 pin-wrong, counted by the lockout, the old PIN still works', async () => {
      const res = await change('000000', NEW_PIN);
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: 'pin-wrong', triesLeft: 4 });
      expect(res.headers['set-cookie']).toBeUndefined();
      // The counter is the one of /api/auth/pin: a wrong login now leaves 3.
      expect((await post('/api/auth/pin', { pin: '000000' })).json()).toMatchObject({ triesLeft: 3 });
      expect((await login()).res.statusCode).toBe(200);
      expect((await login(NEW_PIN)).res.statusCode).toBe(401);
    });

    it('5 wrong current PINs lock (429 with Retry-After), even the right current PIN is refused during the wait, and the PIN login is locked too', async () => {
      for (let i = 0; i < 4; i++) {
        expect((await change('000000', NEW_PIN)).statusCode).toBe(401);
      }
      const fifth = await change('000000', NEW_PIN);
      expect(fifth.statusCode).toBe(429);
      expect(fifth.headers['retry-after']).toBe('60');
      expect(fifth.json()).toMatchObject({ error: 'pin-locked', retryAfterSeconds: 60 });
      const during = await change(PIN, NEW_PIN);
      expect(during.statusCode).toBe(429);
      expect((await post('/api/auth/pin', { pin: PIN })).statusCode).toBe(429);
      expect((await login(NEW_PIN)).res.statusCode).toBe(429);
      clock.now += 61_000;
      expect((await login()).res.statusCode).toBe(200);
    });

    it('change success: the old PIN, access token and refresh cookie are refused; the new session and PIN work', async () => {
      const old = await login();
      const res = await change(PIN, NEW_PIN, { cookie: old.cookie });
      expect(res.statusCode).toBe(200);
      const fresh = res.json() as { accessToken: string; expiresInSeconds: number };
      expect(fresh.expiresInSeconds).toBe(600);
      const freshCookie = String(res.headers['set-cookie']).split(';')[0] ?? '';
      expect(res.headers['set-cookie']).toMatch(new RegExp(`^app-core-refresh=[A-Za-z0-9_-]{43}; ${COOKIE_FLAGS}; Max-Age=604800$`));
      expect(freshCookie).not.toBe(old.cookie);
      expect(res.body).not.toContain(NEW_PIN);
      expect(res.body).not.toContain(PIN);
      expect((await login(PIN)).res.statusCode).toBe(401);
      expect((await post('/api/modules/fx/launch', {}, bearer(old.token))).statusCode).toBe(401);
      const oldRefresh = await post('/api/auth/refresh', {}, { cookie: old.cookie });
      expect(oldRefresh.statusCode).toBe(401);
      expect(oldRefresh.json()).toMatchObject({ error: 'refresh-required' });
      expect((await post('/api/modules/fx/launch', {}, bearer(fresh.accessToken))).statusCode).toBe(200);
      expect((await post('/api/auth/refresh', {}, { cookie: freshCookie })).statusCode).toBe(200);
      expect((await login(NEW_PIN)).res.statusCode).toBe(200);
      // A right current PIN resets the counter of wrong tries.
      expect((await post('/api/auth/pin', { pin: '000000' })).json()).toMatchObject({ triesLeft: 4 });
    });

    it('change to the same PIN: 400 pin-unchanged, nothing changes and no wrong try is counted', async () => {
      const before = fs.readFileSync(authFilePath(configDir), 'utf8');
      const res = await change(PIN, PIN);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'pin-unchanged' });
      expect(fs.readFileSync(authFilePath(configDir), 'utf8')).toBe(before);
      expect((await post('/api/auth/pin', { pin: '000000' })).json()).toMatchObject({ triesLeft: 4 });
    });

    it('change refuses a bad body or a new PIN that is too short (400) without counting a try', async () => {
      const short = await change(PIN, '123');
      expect(short.statusCode).toBe(400);
      expect(short.json()).toMatchObject({ error: 'pin-invalid' });
      for (const body of [{}, { currentPin: PIN }, { newPin: NEW_PIN }, { currentPin: 1, newPin: NEW_PIN }, { currentPin: PIN, newPin: 5 }, { currentPin: 'x'.repeat(5000), newPin: NEW_PIN }]) {
        expect((await post('/api/auth/pin/change', body)).statusCode).toBe(400);
      }
      expect((await login()).res.statusCode).toBe(200);
      expect((await post('/api/auth/pin', { pin: '000000' })).json()).toMatchObject({ triesLeft: 4 });
    });

    it('never puts a PIN or a token in an answer, a log line or an error message (set, change, wrong, locked)', async () => {
      const written: string[] = [];
      const spies = [
        vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => (written.push(String(chunk)), true)),
        vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => (written.push(String(chunk)), true)),
        vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void written.push(args.join(' '))),
        vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void written.push(args.join(' '))),
      ];
      const bodies: string[] = [];
      try {
        bodies.push((await post('/api/auth/pin/set', { pin: '135790' })).body);
        bodies.push((await change('246801', '975310')).body);
        bodies.push((await change(PIN, PIN)).body);
        bodies.push((await change(PIN, '123')).body);
        for (let i = 0; i < 5; i++) {
          bodies.push((await change('246801', '975310')).body);
        }
        bodies.push((await change(PIN, '975310')).body);
        bodies.push(JSON.stringify((await app.server.inject({ method: 'GET', url: '/api/auth/status' })).json()));
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }
      const everything = [...written, ...bodies].join('\n');
      for (const secret of ['135790', '246801', '975310', PIN, '12345']) {
        expect(everything).not.toContain(secret);
      }
      const record = JSON.parse(fs.readFileSync(authFilePath(configDir), 'utf8')) as { pin: { hash: string; salt: string } };
      expect(everything).not.toContain(record.pin.hash);
    });

    it('after a restart the refresh cookie still works; the sessions and the secret are on disk', async () => {
      const { cookie, token } = await login();
      await app.server.close();
      app = await start();
      const refreshed = await post('/api/auth/refresh', {}, { cookie });
      expect(refreshed.statusCode).toBe(200);
      expect((await post('/api/modules/fx/launch', {}, bearer((refreshed.json() as { accessToken: string }).accessToken))).statusCode).toBe(200);
      // The secret and the generation are persisted, so a token not yet expired is still good: it is not tied to the process.
      expect((await post('/api/modules/fx/launch', {}, bearer(token))).statusCode).toBe(200);
      clock.now += 601_000;
      expect((await post('/api/modules/fx/launch', {}, bearer(token))).statusCode).toBe(401);
    });

    it('refuses forged tokens: alg none, wrong signature, expired', async () => {
      const { token } = await login();
      const [, payload] = token.split('.');
      const enc = (v: unknown): string => Buffer.from(JSON.stringify(v)).toString('base64url');
      const noneHeader = enc({ alg: 'none', typ: 'JWT' });
      const hs256 = enc({ alg: 'HS256', typ: 'JWT' });
      const wrongKey = createHmac('sha256', Buffer.alloc(32, 1)).update(`${hs256}.${payload}`).digest('base64url');
      const secret = Buffer.from(fs.readFileSync(secretFilePath(configDir), 'utf8').trim(), 'base64url');
      const stale = enc({ iss: 'app-core', iat: 1_699_000_000, exp: 1_699_000_600, sensitive: true, gen: 0 });
      const expired = `${hs256}.${stale}.${createHmac('sha256', secret).update(`${hs256}.${stale}`).digest('base64url')}`;
      for (const forged of [`${noneHeader}.${payload}.`, `${noneHeader}.${payload}.${wrongKey}`, `${hs256}.${payload}.${wrongKey}`, expired]) {
        expect((await post('/api/modules/fx/launch', {}, bearer(forged))).statusCode).toBe(401);
      }
    });

    it('never writes the PIN or a token to stdout, stderr or the console, for a failed or a successful PIN', async () => {
      const written: string[] = [];
      const spies = [
        vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => (written.push(String(chunk)), true)),
        vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => (written.push(String(chunk)), true)),
        vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void written.push(args.join(' '))),
        vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void written.push(args.join(' '))),
        vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => void written.push(args.join(' '))),
      ];
      let outcome: { wrong: string; right: string; cookie: string; token: string };
      try {
        const wrong = await post('/api/auth/pin', { pin: '135790' });
        const { res, cookie, token } = await login();
        await post('/api/auth/refresh', {}, { cookie });
        await post('/api/modules/fx/launch', {}, bearer(token));
        outcome = { wrong: wrong.body, right: res.body, cookie, token };
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }
      const log = written.join('\n');
      expect(outcome.token).not.toBe('');
      for (const secret of ['135790', PIN, outcome.token, outcome.cookie.split('=')[1] ?? '']) {
        expect(log).not.toContain(secret);
      }
      // Error answers do not echo the PIN either.
      expect(outcome.wrong).not.toContain('135790');
    });
  });

  it('writes auth files only in the config dir given', () => {
    expect(authFilePath(configDir)).toBe(path.join(configDir, 'auth.json'));
  });

  // What a process that is not the browser (the CLI of another tool) asks before it trusts a token it was handed: the same check as a
  // sensitive route, as an answer of its own. No browser headers: a CLI sends none, only a JSON body ({}) like every POST of the API.
  describe('POST /api/auth/verify', () => {
    const verify = (headers: Record<string, string> = {}) => app.server.inject({ method: 'POST', url: '/api/auth/verify', payload: {}, headers });

    it('answers 403 pin-not-set while no PIN exists, even with a Bearer header', async () => {
      const res = await verify(bearer('anything'));
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: 'pin-not-set', message: PIN_NOT_SET_MESSAGE });
    });

    it('answers 401 elevation-required without a token, and for a token that is not one', async () => {
      await setPin(configDir, PIN, now);
      for (const headers of [{}, bearer('not.a.jwt'), bearer('x')]) {
        const res = await verify(headers);
        expect(res.statusCode).toBe(401);
        expect(res.json()).toMatchObject({ error: 'elevation-required' });
      }
    });

    it('answers 200 {ok:true} for the access token the PIN gave, and says nothing else', async () => {
      await setPin(configDir, PIN, now);
      const { token } = await login();
      const res = await verify(bearer(token));
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    });

    it('refuses the token once it has expired (10 minutes) and the reason says so', async () => {
      await setPin(configDir, PIN, now);
      const { token } = await login();
      clock.now += 601_000;
      const res = await verify(bearer(token));
      expect(res.statusCode).toBe(401);
      expect((res.json() as { message: string }).message).toContain('expired');
    });

    it('refuses the token once the session is locked (generation changed)', async () => {
      await setPin(configDir, PIN, now);
      const { token, cookie } = await login();
      expect((await verify(bearer(token))).statusCode).toBe(200);
      await post('/api/auth/logout', {}, { cookie });
      const res = await verify(bearer(token));
      expect(res.statusCode).toBe(401);
      expect((res.json() as { message: string }).message).toContain('revoked');
    });

    it('is the same answer as a sensitive route for the same token', async () => {
      await setPin(configDir, PIN, now);
      const { token } = await login();
      clock.now += 601_000;
      expect((await post('/api/modules/fx/launch', {}, bearer(token))).statusCode).toBe((await verify(bearer(token))).statusCode);
    });
  });
});
