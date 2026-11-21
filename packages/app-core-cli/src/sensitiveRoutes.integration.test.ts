import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHmac } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as url from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PIN_NOT_SET_MESSAGE, setPin } from '@wadeck-app/app-core-server/auth/pin';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const cliEntry = path.join(__dirname, '../dist/cli.js');
const fixture = path.resolve(__dirname, '../../test-app-modules/app-module-sensitive/dist-module/manifest.json');
const PIN = '482915';

interface Running {
  child: ChildProcess;
  base: string;
  output: () => string;
}

// Real processes: the built CLI starts its real server on a free port with a registry holding one built module whose backend
// declares a sensitive route. Every answer below comes over HTTP from that server.
describe('sensitive routes, real server (PIN, refresh cookie, access token)', () => {
  let work: string;
  const running: Running[] = [];

  beforeEach(() => {
    for (const file of [cliEntry, fixture]) {
      if (!fs.existsSync(file)) {
        throw new Error(`${file} is missing: run "npm run build" then "node scripts/build-fixtures.mjs" from the repository root (npm run test:cli does the second).`);
      }
    }
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'sensitive-routes-'));
    fs.mkdirSync(path.join(work, 'modules'), { recursive: true });
    fs.writeFileSync(path.join(work, 'modules', 'sensitive-fixture.json'), JSON.stringify({ id: 'sensitive-fixture', source: { type: 'file', path: fixture } }));
  });

  afterEach(async () => {
    for (const { child } of running.splice(0)) {
      // A killed child has exitCode null and a signalCode: waiting for 'exit' again would never end.
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
        await new Promise((resolve) => child.once('exit', resolve));
      }
    }
    fs.rmSync(work, { recursive: true, force: true });
  });

  const env = (): NodeJS.ProcessEnv => ({ ...process.env, APP_CORE_CONFIG_DIR: work, APP_CORE_CLI_CONFIG_DIR: path.join(work, 'cli'), UPDATER_DISABLE: '1', APP_CORE_CLI_NO_UPDATE: '1' });

  const start = async (): Promise<Running> => {
    const portFile = path.join(work, 'server.port.json');
    fs.rmSync(portFile, { force: true });
    const child = spawn(process.execPath, [cliEntry, 'serve', '--port', '0', '--no-tray', '--no-update'], { cwd: work, env: env(), stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    child.stdout?.on('data', (chunk: Buffer) => (text += chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => (text += chunk.toString()));
    const server: Running = { child, base: '', output: () => text };
    running.push(server);
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`the server exited with ${child.exitCode} before listening:\n${text}`);
      }
      if (fs.existsSync(portFile)) {
        const { pid, port } = JSON.parse(fs.readFileSync(portFile, 'utf8')) as { pid: number; port: number };
        if (pid === child.pid) {
          server.base = `http://127.0.0.1:${port}`;
          const modules = await fetch(`${server.base}/api/modules`).then((r) => r.json() as Promise<{ modules: Array<{ id: string }> }>, () => undefined);
          if (modules?.modules.some((m) => m.id === 'sensitive-fixture') === true) {
            return server;
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`the server did not list the fixture module within 60 s:\n${text}`);
  };

  const stop = async (server: Running): Promise<void> => {
    const exited = new Promise((resolve) => server.child.once('exit', resolve));
    server.child.kill();
    await exited;
  };

  const call = (server: Running, method: string, route: string, init: { body?: unknown; headers?: Record<string, string> } = {}) =>
    fetch(`${server.base}${route}`, {
      method,
      headers: { ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
      ...(method === 'POST' ? { body: JSON.stringify(init.body ?? {}) } : {}),
    });
  const launch = (server: Running, token?: string) => call(server, 'POST', '/api/modules/sensitive-fixture/launch', { headers: token === undefined ? {} : { Authorization: `Bearer ${token}` } });
  const login = async (server: Running, pin = PIN) => {
    const res = await call(server, 'POST', '/api/auth/pin', { body: { pin } });
    return { res, setCookie: res.headers.getSetCookie()[0] ?? '' };
  };
  const cookieOf = (setCookie: string): string => setCookie.split(';')[0] ?? '';

  it('walks the whole protection: no PIN, PIN, login, route, refresh, logout, forged tokens', async () => {
    const server = await start();

    // No PIN chosen: the sensitive route says what to run; the route that is not sensitive is untouched.
    const noPin = await launch(server);
    expect(noPin.status).toBe(403);
    expect(await noPin.json()).toEqual({ error: 'pin-not-set', message: PIN_NOT_SET_MESSAGE });
    expect((await call(server, 'GET', '/api/modules/sensitive-fixture/open')).status).toBe(200);
    expect(await (await call(server, 'GET', '/api/auth/status')).json()).toMatchObject({ pinSet: false, locked: false, elevated: false });

    // The PIN is chosen offline, through the shared function the CLI uses, while the server runs.
    await setPin(work, PIN);
    const noToken = await launch(server);
    expect(noToken.status).toBe(401);
    expect(((await noToken.json()) as { error: string }).error).toBe('elevation-required');
    expect((await launch(server, 'garbage')).status).toBe(401);

    // Login: cookie flags and an access token.
    const { res, setCookie } = await login(server);
    expect(res.status).toBe(200);
    expect(setCookie).toMatch(/^app-core-refresh=[A-Za-z0-9_-]{43}; HttpOnly; SameSite=Strict; Path=\/api\/auth; Max-Age=604800$/);
    const { accessToken, expiresInSeconds } = (await res.json()) as { accessToken: string; expiresInSeconds: number };
    expect(expiresInSeconds).toBe(600);
    const cookie = cookieOf(setCookie);

    // The sensitive route answers with the token.
    const ok = await launch(server, accessToken);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ launched: true });

    // Status with the cookie says elevated, and holds no secret.
    const status = await (await call(server, 'GET', '/api/auth/status', { headers: { Cookie: cookie } })).json();
    expect(status).toEqual({ pinSet: true, locked: false, elevated: true, minPinLength: 4, maxPinLength: 12, resetHint: { files: [path.join(work, 'auth.json')], instruction: expect.any(String) } });

    // Refresh with the cookie: a new token that works, the cookie sent again with the full window.
    const refreshed = await call(server, 'POST', '/api/auth/refresh', { headers: { Cookie: cookie } });
    expect(refreshed.status).toBe(200);
    expect(refreshed.headers.getSetCookie()[0]).toBe(`${cookie}; HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age=604800`);
    const second = ((await refreshed.json()) as { accessToken: string }).accessToken;
    expect((await launch(server, second)).status).toBe(200);

    // Forged tokens: alg none, wrong signature, expired (signed with the real secret).
    const enc = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
    const sign = (secret: Buffer, input: string): string => createHmac('sha256', secret).update(input).digest('base64url');
    const secret = Buffer.from(fs.readFileSync(path.join(work, 'auth-secret'), 'utf8').trim(), 'base64url');
    const claims = (over: Record<string, unknown>) => enc({ iss: 'app-core', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600, sensitive: true, gen: 0, ...over });
    const hs256 = enc({ alg: 'HS256', typ: 'JWT' });
    const none = enc({ alg: 'none', typ: 'JWT' });
    const [, validPayload = ''] = accessToken.split('.');
    const forged = [
      `${none}.${validPayload}.`,
      `${hs256}.${validPayload}.${sign(Buffer.alloc(32, 9), `${hs256}.${validPayload}`)}`,
      `${hs256}.${claims({ iat: 1, exp: 2 })}.${sign(secret, `${hs256}.${claims({ iat: 1, exp: 2 })}`)}`,
    ];
    for (const token of forged) {
      expect((await launch(server, token)).status, token).toBe(401);
    }

    // Logout with a live session: 200 {loggedOut: true}, cookie cleared, the old access tokens die at once, refresh is refused.
    const out = await call(server, 'POST', '/api/auth/logout', { headers: { Cookie: cookie } });
    expect(out.status).toBe(200);
    expect(((await out.json()) as { loggedOut: boolean }).loggedOut).toBe(true);
    expect(out.headers.getSetCookie()[0]).toBe('app-core-refresh=; HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age=0');
    expect((await launch(server, accessToken)).status).toBe(401);
    expect((await launch(server, second)).status).toBe(401);
    const afterLogout = await call(server, 'POST', '/api/auth/refresh', { headers: { Cookie: cookie } });
    expect(afterLogout.status).toBe(401);
    expect(((await afterLogout.json()) as { error: string }).error).toBe('refresh-required');

    // A POST that does not say it is JSON is refused; a page of another site is refused by the request guard.
    expect((await fetch(`${server.base}/api/auth/pin`, { method: 'POST', body: `pin=${PIN}`, headers: { 'Content-Type': 'text/plain' } })).status).toBe(415);
    expect((await call(server, 'POST', '/api/auth/pin', { body: { pin: PIN }, headers: { Origin: 'https://evil.example' } })).status).toBe(403);

    // Neither the PIN nor a token reached the output of the server.
    const log = server.output();
    for (const secretText of [PIN, accessToken, second, cookie.split('=')[1] ?? '']) {
      expect(log).not.toContain(secretText);
    }
  }, 120_000);

  it('after a restart the refresh cookie works and gives a new access token; five wrong PINs lock, even the right one', async () => {
    await setPin(work, PIN);
    const first = await start();
    const { res, setCookie } = await login(first);
    const cookie = cookieOf(setCookie);
    const { accessToken } = (await res.json()) as { accessToken: string };
    await stop(first);

    const second = await start();
    // The refresh token and the secret are on disk: a cookie of the previous run works through refresh.
    const refreshed = await call(second, 'POST', '/api/auth/refresh', { headers: { Cookie: cookie } });
    expect(refreshed.status).toBe(200);
    const fresh = ((await refreshed.json()) as { accessToken: string }).accessToken;
    expect((await launch(second, fresh)).status).toBe(200);
    // The access token of the previous run was signed with the persisted secret and generation, so it is still good until its 10 minutes end.
    expect((await launch(second, accessToken)).status).toBe(200);

    // Lockout: four wrong PINs answer 401, the fifth 429 with Retry-After, then the right one is refused until the wait ends.
    for (let i = 0; i < 4; i++) {
      expect((await login(second, '000000')).res.status).toBe(401);
    }
    const locked = await login(second, '000000');
    expect(locked.res.status).toBe(429);
    expect(Number(locked.res.headers.get('retry-after'))).toBeGreaterThan(50);
    const refused = await login(second, PIN);
    expect(refused.res.status).toBe(429);
    expect(refused.setCookie).toBe('');
    expect(((await refused.res.json()) as { error: string }).error).toBe('pin-locked');
    expect(await (await call(second, 'GET', '/api/auth/status')).json()).toMatchObject({ locked: true });

    // The wait resets with a restart (in memory by design).
    await stop(second);
    const third = await start();
    expect((await login(third)).res.status).toBe(200);
  }, 180_000);

  it('app-core-cli pin set refuses a stdin that is not a terminal, and pin status tells without printing the hash', async () => {
    const run = (args: string[]) => spawnSync(process.execPath, [cliEntry, ...args], { cwd: work, env: env(), input: `${PIN}\n${PIN}\n`, encoding: 'utf8', timeout: 60_000 });
    const refused = run(['pin', 'set']);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/interactive terminal/);
    expect(fs.existsSync(path.join(work, 'auth.json'))).toBe(false);
    const argv = run(['pin', 'set', PIN]);
    expect(argv.status).toBe(1);
    expect(argv.stderr).not.toContain(PIN);
    expect(run(['pin', 'status']).stdout).toMatch(/No PIN is set.*app-core-cli pin set/);
    await setPin(work, PIN);
    const status = run(['pin', 'status']);
    expect(status.status).toBe(0);
    expect(status.stdout).toMatch(/A PIN is set/);
    expect(status.stdout).not.toContain((JSON.parse(fs.readFileSync(path.join(work, 'auth.json'), 'utf8')) as { pin: { hash: string } }).pin.hash);
  }, 120_000);
});
