import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { PinLockout } from './lockout.js';
import { isPinSet, MAX_PIN_LENGTH, verifyPin } from './pin.js';
import { ACCESS_TOKEN_SECONDS, REFRESH_WINDOW_MS, SessionStore, signAccessToken } from './tokens.js';

export interface AuthRoutesOptions {
  configDir: string;
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

  server.post('/api/auth/pin', async (request, reply) => {
    const pin = (request.body as { pin?: unknown } | null | undefined)?.pin;
    if (typeof pin !== 'string' || pin === '' || pin.length > MAX_PIN_LENGTH) {
      return reply.code(400).send({ error: 'bad-request', message: `The body must be {"pin": "<the PIN>"}, a text of 1 to ${MAX_PIN_LENGTH} characters.` });
    }
    return oneAtATime(async () => {
      if (!isPinSet(configDir)) {
        return reply.code(403).send({ error: 'pin-not-set', message: 'Run "app-core-cli pin set" to choose the PIN that unlocks sensitive actions.' });
      }
      const locked = lockout.check();
      if (locked.locked) {
        return reply
          .code(429)
          .header('Retry-After', String(locked.retryAfterSeconds))
          .send({ error: 'pin-locked', retryAfterSeconds: locked.retryAfterSeconds, message: `Too many wrong PINs. Try again in ${locked.retryAfterSeconds} seconds.` });
      }
      if (!(await verifyPin(configDir, pin))) {
        lockout.recordFailure();
        const after = lockout.check();
        if (after.locked) {
          return reply
            .code(429)
            .header('Retry-After', String(after.retryAfterSeconds))
            .send({ error: 'pin-locked', retryAfterSeconds: after.retryAfterSeconds, message: `Wrong PIN, and too many wrong tries. Try again in ${after.retryAfterSeconds} seconds.` });
        }
        const triesLeft = lockout.triesLeft();
        return reply.code(401).send({ error: 'pin-wrong', triesLeft, message: `Wrong PIN. ${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} left before a wait of ${minutes(lockout.nextWaitSeconds())}.` });
      }
      lockout.recordSuccess();
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
    sessions.logout(refreshTokenOf(request));
    return reply.code(204).header('Set-Cookie', cookieHeader('', 0)).send();
  });

  server.get('/api/auth/status', async (request) => {
    const token = refreshTokenOf(request);
    return { pinSet: isPinSet(configDir), locked: lockout.check().locked, elevated: token !== undefined && sessions.findRefresh(token) };
  });
};
