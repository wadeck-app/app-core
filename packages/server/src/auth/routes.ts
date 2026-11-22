import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { looksLikeShellRequest } from '../requestGuard.js';
import type { RegisterProtection } from './registerGuard.js';
import { refuseUnlessElevated } from './guard.js';
import { PinLockout } from './lockout.js';
import { isPinSet, MAX_PIN_LENGTH, MAX_PIN_REQUEST_LENGTH, MIN_PIN_LENGTH, PIN_NOT_SET_MESSAGE, pinProblem, pinResetHint, setPin, verifyPin } from './pin.js';
import { ACCESS_TOKEN_SECONDS, REFRESH_WINDOW_MS, SessionStore, signAccessToken } from './tokens.js';

export interface AuthRoutesOptions {
  configDir: string;
  // The host names the server answers to (see requestGuard.ts): the first PIN is taken only from a request that looks like the shell's.
  allowedHosts: ReadonlySet<string>;
  // Shown in the status so a later screen can say whether register / update / unregister without the machine token is refused.
  registerProtection: RegisterProtection;
  // Epoch milliseconds; tests inject their own clock.
  now?: () => number;
}

export const REFRESH_COOKIE = 'app-core-refresh';
// No `Secure`: the server answers in plain http on localhost, and a browser does not store a Secure cookie from an http address
// (localhost excepted by some, not all). SameSite=Strict and the request guard are what keep other sites out; Path limits the
// cookie to /api/auth, so it is not sent with module requests.
const COOKIE_FLAGS = 'HttpOnly; SameSite=Strict; Path=/api/auth';

const cookieHeader = (token: string, maxAgeSeconds: number): string => `${REFRESH_COOKIE}=${token}; ${COOKIE_FLAGS}; Max-Age=${maxAgeSeconds}`;

function refreshTokenOf(request: FastifyRequest): string | undefined {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at !== -1 && part.slice(0, at).trim() === REFRESH_COOKIE) {
      const value = part.slice(at + 1).trim();
      return value === '' ? undefined : value;
    }
  }
  return undefined;
}

const minutes = (seconds: number): string => (seconds % 60 === 0 ? `${seconds / 60} minute${seconds === 60 ? '' : 's'}` : `${seconds} seconds`);

// /api/auth/*: the PIN, the refresh cookie and the access token (see tokens.ts). No PIN, token or cookie value is ever logged or
// put in an error message: the server has no request logger, and nothing here writes them anywhere but to the answer that asked.
export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (server, options) => {
  const { configDir } = options;
  const now = options.now ?? Date.now;
  const lockout = new PinLockout(now);
  const sessions = new SessionStore(configDir, now);

  // A request that changes something must say it is JSON: a body-less POST without a Content-Type is what a foreign page can send
  // without asking the browser's permission (see requestGuard.ts).
  server.addHook('onRequest', async (request, reply) => {
    if (request.method === 'POST' && !/^application\/json\b/i.test(request.headers['content-type'] ?? '')) {
      return reply.code(415).send({
        error: 'unsupported-media-type',
        message: `POST ${request.url.split('?')[0]} needs "Content-Type: application/json" (send {} when there is nothing to say).`,
      });
    }
  });

  // One PIN try at a time: parallel requests must not all pass the lock check before the first wrong try is counted.
  let queue: Promise<unknown> = Promise.resolve();
  const oneAtATime = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  const issue = (reply: FastifyReply, refreshToken: string) =>
    reply.header('Set-Cookie', cookieHeader(refreshToken, REFRESH_WINDOW_MS / 1000)).send({ accessToken: signAccessToken(configDir, now), expiresInSeconds: ACCESS_TOKEN_SECONDS });

  // Checks the current PIN with the lockout rules, for the login and for "change". Sends the refusal and returns false, or counts the
  // success and returns true. Must run inside oneAtATime.
  const checkCurrentPin = async (reply: FastifyReply, pin: string): Promise<boolean> => {
    if (!isPinSet(configDir)) {
      reply.code(403).send({ error: 'pin-not-set', message: PIN_NOT_SET_MESSAGE });
      return false;
    }
    const locked = lockout.check();
    if (locked.locked) {
      reply
        .code(429)
        .header('Retry-After', String(locked.retryAfterSeconds))
        .send({ error: 'pin-locked', retryAfterSeconds: locked.retryAfterSeconds, message: `Too many wrong PINs. Try again in ${locked.retryAfterSeconds} seconds.` });
      return false;
    }
    if (!(await verifyPin(configDir, pin))) {
      lockout.recordFailure();
      const after = lockout.check();
      if (after.locked) {
        reply
          .code(429)
          .header('Retry-After', String(after.retryAfterSeconds))
          .send({ error: 'pin-locked', retryAfterSeconds: after.retryAfterSeconds, message: `Wrong PIN, and too many wrong tries. Try again in ${after.retryAfterSeconds} seconds.` });
        return false;
      }
      const triesLeft = lockout.triesLeft();
      reply.code(401).send({ error: 'pin-wrong', triesLeft, message: `Wrong PIN. ${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} left before a wait of ${minutes(lockout.nextWaitSeconds())}.` });
      return false;
    }
    lockout.recordSuccess();
    return true;
  };

  const textOf = (value: unknown): string | undefined => (typeof value === 'string' && value.length <= MAX_PIN_REQUEST_LENGTH ? value : undefined);

  server.post('/api/auth/pin', async (request, reply) => {
    const pin = (request.body as { pin?: unknown } | null | undefined)?.pin;
    if (typeof pin !== 'string' || pin === '' || pin.length > MAX_PIN_REQUEST_LENGTH) {
      return reply.code(400).send({ error: 'bad-request', message: `The body must be {"pin": "<the PIN>"}, a text of 1 to ${MAX_PIN_REQUEST_LENGTH} characters.` });
    }
    return oneAtATime(async () => ((await checkCurrentPin(reply, pin)) ? issue(reply, sessions.createRefresh()) : reply));
  });

  // Chooses the first PIN. Only while none exists: the check and the write run in oneAtATime, so two simultaneous calls cannot both
  // find "no PIN". Answers like the login, so the user is unlocked at once.
  server.post('/api/auth/pin/set', async (request, reply) => {
    // A bare curl is refused (D12); a script that forges Origin still passes. Checked first: nothing else is said to such a request.
    if (!looksLikeShellRequest(request.headers, options.allowedHosts)) {
      return reply.code(403).send({ error: 'browser-required', message: 'The first PIN is chosen in the app-core dashboard in your browser, or with "app-core-cli pin set" in a terminal.' });
    }
    const pin = textOf((request.body as { pin?: unknown } | null | undefined)?.pin);
    if (pin === undefined) {
      return reply.code(400).send({ error: 'bad-request', message: `The body must be {"pin": "<the new PIN>"}, a text of at most ${MAX_PIN_REQUEST_LENGTH} characters.` });
    }
    return oneAtATime(async () => {
      if (isPinSet(configDir)) {
        return reply.code(409).send({ error: 'pin-already-set', message: 'A PIN is already set, and it is not replaced from here. To change it, give the current PIN (POST /api/auth/pin/change, "Change PIN" in the top bar).' });
      }
      const problem = pinProblem(pin);
      if (problem !== undefined) {
        return reply.code(400).send({ error: 'pin-invalid', message: problem });
      }
      await setPin(configDir, pin, now);
      lockout.recordSuccess();
      return issue(reply, sessions.createRefresh());
    });
  });

  // Changes the PIN: the current one is checked like at the login (a wrong one is a counted try, the lockout applies). setPin revokes
  // every refresh token and access token; the caller gets a fresh session.
  server.post('/api/auth/pin/change', async (request, reply) => {
    const body = request.body as { currentPin?: unknown; newPin?: unknown } | null | undefined;
    const currentPin = textOf(body?.currentPin);
    const newPin = textOf(body?.newPin);
    if (currentPin === undefined || currentPin === '' || newPin === undefined) {
      return reply.code(400).send({ error: 'bad-request', message: `The body must be {"currentPin": "<the PIN>", "newPin": "<the new PIN>"}, texts of at most ${MAX_PIN_REQUEST_LENGTH} characters.` });
    }
    // Before the current PIN is looked at: neither of these is a guess, so neither counts as a wrong try.
    const problem = pinProblem(newPin);
    if (problem !== undefined) {
      return reply.code(400).send({ error: 'pin-invalid', message: problem });
    }
    return oneAtATime(async () => {
      if (!(await checkCurrentPin(reply, currentPin))) {
        return reply;
      }
      if (newPin === currentPin) {
        return reply.code(400).send({ error: 'pin-unchanged', message: 'The new PIN is the same as the current one. Choose a different PIN, or cancel to keep the current one.' });
      }
      await setPin(configDir, newPin, now);
      return issue(reply, sessions.createRefresh());
    });
  });

  server.post('/api/auth/refresh', async (request, reply) => {
    const token = refreshTokenOf(request);
    if (token === undefined || !sessions.useRefresh(token)) {
      return reply.code(401).send({
        error: 'refresh-required',
        message: 'No valid session: the PIN is needed (POST /api/auth/pin). A session ends after 7 days without use, or when it is locked or the PIN is changed.',
      });
    }
    return issue(reply, token);
  });

  server.post('/api/auth/logout', async (request, reply) => {
    // Only a live session locks: without one (no cookie, an expired or unknown one) nothing is revoked, so a caller that holds no
    // session cannot log the user out. The cookie is cleared either way.
    const loggedOut = sessions.logout(refreshTokenOf(request));
    reply.header('Set-Cookie', cookieHeader('', 0));
    return loggedOut ? { loggedOut } : { loggedOut, message: 'No valid session was presented (no refresh cookie, or it expired): nothing was locked. If sensitive actions are still unlocked in another browser, lock them from that browser.' };
  });

  // For a process that holds an access token and must not trust it blindly (the CLI of another tool, called by a module): the same
  // check a `sensitive` route makes, answered on its own. It reveals no claim and no secret, and only confirms a token the caller
  // already has. Not a PIN guess surface: it takes no PIN.
  server.post('/api/auth/verify', async (request, reply) => {
    const refusal = refuseUnlessElevated(configDir, request.headers.authorization, now);
    if (refusal !== undefined) {
      return reply.code(refusal.status).send(refusal.body);
    }
    return { ok: true };
  });

  server.get('/api/auth/status', async (request) => {
    const token = refreshTokenOf(request);
    const pinSet = isPinSet(configDir);
    // A session left over from a PIN deleted by hand does not unlock anything: no PIN, no elevation.
    return { pinSet, locked: pinSet && lockout.check().locked, elevated: pinSet && token !== undefined && sessions.findRefresh(token), resetHint: pinResetHint(configDir), minPinLength: MIN_PIN_LENGTH, maxPinLength: MAX_PIN_LENGTH, registerProtection: options.registerProtection };
  });
};
