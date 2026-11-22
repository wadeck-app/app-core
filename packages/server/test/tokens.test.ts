import { createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ACCESS_TOKEN_SECONDS,
  REFRESH_WINDOW_MS,
  SessionStore,
  secretFilePath,
  sessionsFilePath,
  sessionsLockPath,
  signAccessToken,
  verifyAccessToken,
} from '../src/auth/tokens.js';

const b64 = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = (secret: Buffer, signingInput: string): string => createHmac('sha256', secret).update(signingInput).digest('base64url');

describe('access token (JWT HS256)', () => {
  let dir: string;
  const clock = { now: 1_700_000_000_000 };
  const now = (): number => clock.now;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-jwt-'));
    clock.now = 1_700_000_000_000;
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const secret = (): Buffer => Buffer.from(fs.readFileSync(secretFilePath(dir), 'utf8').trim(), 'base64url');

  it('creates a 32-byte secret on first use, then keeps it', () => {
    expect(fs.existsSync(secretFilePath(dir))).toBe(false);
    signAccessToken(dir, now);
    const first = secret();
    expect(first).toHaveLength(32);
    signAccessToken(dir, now);
    expect(secret().equals(first)).toBe(true);
    if (process.platform !== 'win32') {
      expect(fs.statSync(secretFilePath(dir)).mode & 0o777).toBe(0o600);
    }
  });

  it('signs iss, iat, exp (10 minutes), sensitive and gen with alg HS256', () => {
    const token = signAccessToken(dir, now);
    expect(ACCESS_TOKEN_SECONDS).toBe(600);
    const [header, payload] = token.split('.').slice(0, 2).map((part) => JSON.parse(Buffer.from(part ?? '', 'base64url').toString('utf8')) as Record<string, unknown>);
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(payload).toEqual({ iss: 'app-core', iat: 1_700_000_000, exp: 1_700_000_600, sensitive: true, gen: 0 });
    expect(verifyAccessToken(dir, token, now)).toEqual({ ok: true });
  });

  it('refuses an expired token, naming the reason', () => {
    const token = signAccessToken(dir, now);
    clock.now += 601_000;
    expect(verifyAccessToken(dir, token, now)).toEqual({ ok: false, reason: 'expired' });
  });

  it('refuses a token signed with another secret', () => {
    const token = signAccessToken(dir, now);
    const [h, p] = token.split('.');
    const forged = `${h}.${p}.${sign(Buffer.alloc(32, 7), `${h}.${p}`)}`;
    expect(verifyAccessToken(dir, forged, now)).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('refuses alg none, with and without a signature', () => {
    signAccessToken(dir, now);
    const payload = b64({ iss: 'app-core', iat: 1_700_000_000, exp: 1_700_000_600, sensitive: true, gen: 0 });
    for (const alg of ['none', 'None', 'NONE']) {
      const head = b64({ alg, typ: 'JWT' });
      expect(verifyAccessToken(dir, `${head}.${payload}.`, now)).toEqual({ ok: false, reason: 'bad-algorithm' });
      expect(verifyAccessToken(dir, `${head}.${payload}.${sign(secret(), `${head}.${payload}`)}`, now)).toEqual({ ok: false, reason: 'bad-algorithm' });
    }
  });

  it('refuses another HMAC or asymmetric algorithm even when correctly signed', () => {
    signAccessToken(dir, now);
    const payload = b64({ iss: 'app-core', iat: 1_700_000_000, exp: 1_700_000_600, sensitive: true, gen: 0 });
    for (const alg of ['HS384', 'HS512', 'RS256']) {
      const head = b64({ alg, typ: 'JWT' });
      expect(verifyAccessToken(dir, `${head}.${payload}.${sign(secret(), `${head}.${payload}`)}`, now)).toEqual({ ok: false, reason: 'bad-algorithm' });
    }
  });

  it('refuses a wrong issuer or a missing sensitive claim even when correctly signed', () => {
    signAccessToken(dir, now);
    const head = b64({ alg: 'HS256', typ: 'JWT' });
    const sealed = (claims: Record<string, unknown>): string => {
      const payload = b64(claims);
      return `${head}.${payload}.${sign(secret(), `${head}.${payload}`)}`;
    };
    const good = { iss: 'app-core', iat: 1_700_000_000, exp: 1_700_000_600, sensitive: true, gen: 0 };
    expect(verifyAccessToken(dir, sealed(good), now)).toEqual({ ok: true });
    expect(verifyAccessToken(dir, sealed({ ...good, iss: 'other' }), now)).toEqual({ ok: false, reason: 'bad-claims' });
    expect(verifyAccessToken(dir, sealed({ ...good, sensitive: false }), now)).toEqual({ ok: false, reason: 'bad-claims' });
    expect(verifyAccessToken(dir, sealed({ ...good, exp: 'soon' }), now)).toEqual({ ok: false, reason: 'bad-claims' });
  });

  it('refuses garbage without throwing', () => {
    for (const bad of ['', 'a', 'a.b', 'a.b.c', 'a.b.c.d', '...', '!!!.???.***']) {
      expect(verifyAccessToken(dir, bad, now).ok).toBe(false);
    }
  });

  it('refuses every token of an older generation once the generation moved (logout)', () => {
    const token = signAccessToken(dir, now);
    new SessionStore(dir, now).revokeAll();
    expect(verifyAccessToken(dir, token, now)).toEqual({ ok: false, reason: 'revoked' });
    expect(verifyAccessToken(dir, signAccessToken(dir, now), now)).toEqual({ ok: true });
  });

  it('says what to do when the secret file is damaged', () => {
    fs.writeFileSync(secretFilePath(dir), 'short');
    expect(() => signAccessToken(dir, now)).toThrow(/auth-secret.*32 bytes.*Delete it/s);
  });
});

describe('refresh tokens', () => {
  let dir: string;
  const clock = { now: 1_700_000_000_000 };
  const now = (): number => clock.now;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-refresh-'));
    clock.now = 1_700_000_000_000;
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const onDisk = (): { generation: number; sessions: Array<Record<string, unknown>> } => JSON.parse(fs.readFileSync(sessionsFilePath(dir), 'utf8'));

  it('keeps 32 random bytes as base64url, and only their SHA-256 on disk', () => {
    const store = new SessionStore(dir, now);
    const token = store.createRefresh();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const raw = fs.readFileSync(sessionsFilePath(dir), 'utf8');
    expect(raw).not.toContain(token);
    const [entry] = onDisk().sessions;
    expect(entry).toMatchObject({ createdAt: clock.now, lastUsedAt: clock.now, expiresAt: clock.now + REFRESH_WINDOW_MS });
    expect(entry?.['hash']).toMatch(/^[0-9a-f]{64}$/);
    expect(REFRESH_WINDOW_MS).toBe(7 * 24 * 3600 * 1000);
  });

  it('survives a restart (a new store reads the file)', () => {
    const token = new SessionStore(dir, now).createRefresh();
    expect(new SessionStore(dir, now).findRefresh(token)).toBe(true);
    expect(new SessionStore(dir, now).findRefresh('x'.repeat(43))).toBe(false);
  });

  it('slides the expiry to 7 days from the use, writing the file at most once a minute per token', () => {
    const store = new SessionStore(dir, now);
    const token = store.createRefresh();
    clock.now += 10_000;
    expect(store.useRefresh(token)).toBe(true);
    // Within a minute of the last write: the file still holds the first write.
    expect(onDisk().sessions[0]?.['lastUsedAt']).toBe(1_700_000_000_000);
    clock.now += 61_000;
    expect(store.useRefresh(token)).toBe(true);
    expect(onDisk().sessions[0]).toMatchObject({ lastUsedAt: clock.now, expiresAt: clock.now + REFRESH_WINDOW_MS });
    const written = clock.now;
    clock.now += 5_000;
    store.useRefresh(token);
    expect(onDisk().sessions[0]?.['lastUsedAt']).toBe(written);
  });

  it('keeps the slid expiry in memory between two disk writes', () => {
    const store = new SessionStore(dir, now);
    const token = store.createRefresh();
    // Used 6 days later: written. A use 30 s later is not written, but the 7 days count from it.
    clock.now += 6 * 24 * 3600 * 1000;
    const written = clock.now;
    store.useRefresh(token);
    clock.now += 30_000;
    store.useRefresh(token);
    // Past the 7 days of the written expiry, inside the 7 days of the last use.
    clock.now = written + REFRESH_WINDOW_MS + 10_000;
    expect(store.findRefresh(token)).toBe(true);
    clock.now = written + 30_000 + REFRESH_WINDOW_MS + 1;
    expect(store.findRefresh(token)).toBe(false);
  });

  it('refuses an expired token and purges it from the file when the file is read', () => {
    const store = new SessionStore(dir, now);
    const token = store.createRefresh();
    clock.now += REFRESH_WINDOW_MS + 1;
    expect(store.useRefresh(token)).toBe(false);
    expect(onDisk().sessions).toEqual([]);
  });

  it('stays valid for 7 days of use, whatever the total age (no absolute cap)', () => {
    const store = new SessionStore(dir, now);
    const token = store.createRefresh();
    for (let day = 0; day < 20; day++) {
      clock.now += 6 * 24 * 3600 * 1000;
      expect(store.useRefresh(token)).toBe(true);
    }
  });

  it('does not extend on findRefresh (the status check)', () => {
    const store = new SessionStore(dir, now);
    const token = store.createRefresh();
    clock.now += 3 * 24 * 3600 * 1000;
    expect(store.findRefresh(token)).toBe(true);
    clock.now += 5 * 24 * 3600 * 1000;
    expect(store.findRefresh(token)).toBe(false);
  });

  it('logout deletes that refresh token and increments the generation, leaving other sessions', () => {
    const store = new SessionStore(dir, now);
    const a = store.createRefresh();
    const b = store.createRefresh();
    expect(store.generation()).toBe(0);
    store.logout(a);
    expect(store.generation()).toBe(1);
    expect(store.findRefresh(a)).toBe(false);
    expect(store.findRefresh(b)).toBe(true);
    expect(onDisk().generation).toBe(1);
  });

  it('logout with an unknown or missing token changes nothing and says so', () => {
    const store = new SessionStore(dir, now);
    const a = store.createRefresh();
    expect(store.logout('x'.repeat(43))).toBe(false);
    expect(store.logout(undefined)).toBe(false);
    expect(store.generation()).toBe(0);
    expect(store.findRefresh(a)).toBe(true);
    expect(store.logout(a)).toBe(true);
  });

  it('reports an entry whose hash is not 64 hex characters instead of crashing the comparison later', () => {
    new SessionStore(dir, now).createRefresh();
    const file = onDisk();
    (file.sessions[0] as Record<string, unknown>)['hash'] = 'abc';
    fs.writeFileSync(sessionsFilePath(dir), JSON.stringify(file));
    const store = new SessionStore(dir, now);
    expect(() => store.findRefresh('x'.repeat(43))).toThrow(/auth-sessions.json.*not valid.*Delete it/s);
    expect(() => store.useRefresh('x'.repeat(43))).toThrow(/auth-sessions.json.*not valid/s);
  });

  it('says what to do when the sessions file is damaged', () => {
    fs.writeFileSync(sessionsFilePath(dir), '{oops');
    expect(() => new SessionStore(dir, now).generation()).toThrow(/auth-sessions\.json.*not valid.*Delete it/s);
  });
});

// The server and `app-core-cli pin set` (another process) both read, change and write auth-sessions.json: without a lock, a write made
// from an older read can undo the other's generation bump, and tokens revoked by a new PIN would be valid again.
describe('the lock around auth-sessions.json', () => {
  let dir: string;
  const clock = { now: 1_700_000_000_000 };
  const now = (): number => clock.now;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-lock-'));
    clock.now = 1_700_000_000_000;
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const store = (): SessionStore => new SessionStore(dir, now, { lockTimeoutMs: 80 });
  const writeLock = (content: string): void => fs.writeFileSync(sessionsLockPath(dir), content);
  const deadPid = (): number => {
    const child = spawnSync(process.execPath, ['--version']);
    if (child.pid === undefined) {
      throw new Error('could not start a child process to get a pid that is gone');
    }
    return child.pid;
  };

  it('leaves no lock file behind after any change', () => {
    const sessions = store();
    const token = sessions.createRefresh();
    expect(fs.existsSync(sessionsLockPath(dir))).toBe(false);
    sessions.useRefresh(token);
    sessions.findRefresh(token);
    sessions.logout(token);
    sessions.revokeAll();
    expect(fs.existsSync(sessionsLockPath(dir))).toBe(false);
  });

  it('releases the lock when the change fails (a damaged file), so the next one is not blocked', () => {
    fs.writeFileSync(sessionsFilePath(dir), '{oops');
    expect(() => store().createRefresh()).toThrow(/not valid/);
    expect(fs.existsSync(sessionsLockPath(dir))).toBe(false);
  });

  it('refuses to change the file while a live process holds the lock, says who holds it and what to delete, and writes nothing', () => {
    const sessions = store();
    sessions.revokeAll();
    const before = fs.readFileSync(sessionsFilePath(dir), 'utf8');
    writeLock(JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
    expect(() => sessions.createRefresh()).toThrow(new RegExp(`auth-sessions\\.json\\.lock.*pid ${process.pid}.*delete`, 'is'));
    expect(() => sessions.revokeAll()).toThrow(/auth-sessions\.json\.lock/);
    expect(fs.readFileSync(sessionsFilePath(dir), 'utf8')).toBe(before);
    // Not ours to remove: the holder is alive.
    expect(fs.existsSync(sessionsLockPath(dir))).toBe(true);
  });

  it('takes over a lock whose process is gone (a crash), then removes it', () => {
    writeLock(JSON.stringify({ pid: deadPid(), at: new Date().toISOString() }));
    expect(() => store().createRefresh()).not.toThrow();
    expect(fs.existsSync(sessionsLockPath(dir))).toBe(false);
  });

  it('takes over a lock that is much older than any change takes, even when its pid is alive (a reused pid)', () => {
    writeLock(JSON.stringify({ pid: process.pid, at: new Date(0).toISOString() }));
    const old = new Date(Date.now() - 10 * 60_000);
    fs.utimesSync(sessionsLockPath(dir), old, old);
    expect(() => store().createRefresh()).not.toThrow();
    expect(fs.existsSync(sessionsLockPath(dir))).toBe(false);
  });

  it('does not take a fresh lock it cannot read (its writer may be between creating and filling it)', () => {
    writeLock('');
    expect(() => store().createRefresh()).toThrow(/auth-sessions\.json\.lock/);
  });

  it('reading the generation needs no lock: a verifier is never blocked by a writer', () => {
    const sessions = store();
    sessions.revokeAll();
    writeLock(JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
    expect(sessions.generation()).toBe(1);
  });

  it('is re-entrant inside one store: a change that reads the file (purging expired entries) does not wait for itself', () => {
    const sessions = store();
    const token = sessions.createRefresh();
    clock.now += 8 * 24 * 3600 * 1000;
    expect(sessions.useRefresh(token)).toBe(false);
    expect(fs.existsSync(sessionsLockPath(dir))).toBe(false);
  });
});
