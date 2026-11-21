import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicWrite.js';

// Two kinds of token, both proving that the user typed the PIN:
//  - the access token: a JWT (HS256, built here with node:crypto, no library) that lives 10 minutes and is sent as
//    `Authorization: Bearer`; it is what a `sensitive` route checks;
//  - the refresh token: 32 random bytes, kept in an HttpOnly cookie, stored here only as a SHA-256 hash, valid for
//    REFRESH_WINDOW_MS from its last use; it is what gives a new access token without typing the PIN again.
// Files (in the app-core config dir, mode 0600 where the platform enforces modes; Windows does not): `auth-secret` (the signing
// key, created at first use, never logged) and `auth-sessions.json` (refresh hashes and the generation counter). They survive
// restarts and updates of the server.

// One constant for the sliding window of a refresh token. There is no absolute cap on purpose: daily use never asks for the PIN again.
export const REFRESH_WINDOW_MS = 7 * 24 * 3600 * 1000;
export const ACCESS_TOKEN_SECONDS = 600;
// A use of a refresh token moves its expiry in memory at once, but the file is rewritten at most this often per token.
export const SESSION_WRITE_THROTTLE_MS = 60_000;

const ISSUER = 'app-core';
const SECRET_BYTES = 32;

export const secretFilePath = (configDir: string): string => path.join(configDir, 'auth-secret');
export const sessionsFilePath = (configDir: string): string => path.join(configDir, 'auth-sessions.json');

// The signing secret: read, or created at the first use (flag 'wx' so two processes never end with two different secrets).
function readSecret(configDir: string): Buffer {
  const file = secretFilePath(configDir);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
    fs.mkdirSync(configDir, { recursive: true });
    try {
      fs.writeFileSync(file, randomBytes(SECRET_BYTES).toString('base64url'), { flag: 'wx', mode: 0o600 });
    } catch (writeErr) {
      if ((writeErr as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw writeErr;
      }
    }
    text = fs.readFileSync(file, 'utf8');
  }
  const secret = Buffer.from(text.trim(), 'base64url');
  if (secret.length !== SECRET_BYTES) {
    throw new Error(`${file} must hold ${SECRET_BYTES} bytes (base64url) but holds ${secret.length}. Delete it: a new secret is created at the next use, and every access token issued so far stops working (refresh tokens still do).`);
  }
  return secret;
}

const hmac = (secret: Buffer, signingInput: string): Buffer => createHmac('sha256', secret).update(signingInput).digest();
const encodeJson = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

function decodeJson(part: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export function signAccessToken(configDir: string, now: () => number = Date.now): string {
  const secret = readSecret(configDir);
  const issuedAt = Math.floor(now() / 1000);
  const header = encodeJson({ alg: 'HS256', typ: 'JWT' });
  const payload = encodeJson({
    iss: ISSUER,
    iat: issuedAt,
    exp: issuedAt + ACCESS_TOKEN_SECONDS,
    sensitive: true,
    gen: new SessionStore(configDir, now).generation(),
  });
  return `${header}.${payload}.${hmac(secret, `${header}.${payload}`).toString('base64url')}`;
}

export type AccessTokenVerdict = { ok: true } | { ok: false; reason: 'malformed' | 'bad-algorithm' | 'bad-signature' | 'bad-claims' | 'expired' | 'revoked' };

// The algorithm is checked first and must be exactly HS256: `none`, other HMACs and asymmetric algorithms are refused even when the
// rest would verify. Then the signature (constant time), the claims, the expiry and the generation.
export function verifyAccessToken(configDir: string, token: string, now: () => number = Date.now): AccessTokenVerdict {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { ok: false, reason: 'malformed' };
  }
  const [headerPart = '', payloadPart = '', signaturePart = ''] = parts;
  const header = decodeJson(headerPart);
  if (header === undefined) {
    return { ok: false, reason: 'malformed' };
  }
  if (header['alg'] !== 'HS256') {
    return { ok: false, reason: 'bad-algorithm' };
  }
  const expected = hmac(readSecret(configDir), `${headerPart}.${payloadPart}`);
  const given = Buffer.from(signaturePart, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'bad-signature' };
  }
  const claims = decodeJson(payloadPart);
  if (claims === undefined || claims['iss'] !== ISSUER || claims['sensitive'] !== true || typeof claims['exp'] !== 'number' || typeof claims['iat'] !== 'number' || typeof claims['gen'] !== 'number') {
    return { ok: false, reason: 'bad-claims' };
  }
  if (claims['exp'] <= Math.floor(now() / 1000)) {
    return { ok: false, reason: 'expired' };
  }
  if (claims['gen'] !== new SessionStore(configDir, now).generation()) {
    return { ok: false, reason: 'revoked' };
  }
  return { ok: true };
}

interface SessionEntry {
  hash: string;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
}
interface SessionsFile {
  generation: number;
  sessions: SessionEntry[];
}

const hashOf = (token: string): string => createHash('sha256').update(token).digest('hex');

// The hash is compared in constant time against a SHA-256: anything but 64 hex characters would make that comparison throw, so a file
// holding it is refused as damaged (read() says what to do) instead of failing every refresh later.
const SHA256_HEX = /^[0-9a-f]{64}$/;

function isEntry(value: unknown): value is SessionEntry {
  const e = value as Partial<Record<keyof SessionEntry, unknown>> | null;
  return typeof e === 'object' && e !== null && typeof e.hash === 'string' && SHA256_HEX.test(e.hash) && typeof e.createdAt === 'number' && typeof e.lastUsedAt === 'number' && typeof e.expiresAt === 'number';
}

// The refresh tokens and the generation counter, in auth-sessions.json. The file is read at every operation (the CLI changes it
// while the server runs: a new PIN revokes everything); what is not worth a disk write (the slid expiry of a token used again within
// SESSION_WRITE_THROTTLE_MS) is kept in memory and applied on top of what is read.
export class SessionStore {
  // Slid expiry not yet written, by token hash.
  private readonly pending = new Map<string, { lastUsedAt: number; expiresAt: number }>();

  constructor(
    private readonly configDir: string,
    private readonly now: () => number = Date.now,
  ) {}

  private read(): SessionsFile {
    const file = sessionsFilePath(this.configDir);
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { generation: 0, sessions: [] };
      }
      throw err;
    }
    let parsed: Partial<SessionsFile> | null;
    try {
      parsed = JSON.parse(text) as Partial<SessionsFile> | null;
    } catch {
      parsed = null;
    }
    if (parsed === null || typeof parsed !== 'object' || typeof parsed.generation !== 'number' || !Array.isArray(parsed.sessions) || !parsed.sessions.every(isEntry)) {
      throw new Error(`${file} is not valid (it should hold {"generation": number, "sessions": [...]}). Delete it: every refresh token is lost, so the PIN is asked again in the browser.`);
    }
    return { generation: parsed.generation, sessions: parsed.sessions };
  }

  private write(content: SessionsFile): void {
    writeFileAtomic(sessionsFilePath(this.configDir), JSON.stringify(content, null, 2));
  }

  // What is in the file, expired entries purged (and the purge written). `effective` has the unwritten slid expiry applied.
  private load(): { raw: SessionsFile; effective: SessionEntry[] } {
    const raw = this.read();
    const now = this.now();
    const withPending = raw.sessions.map((entry) => ({ ...entry, ...(this.pending.get(entry.hash) ?? {}) }));
    const live = withPending.filter((entry) => entry.expiresAt > now);
    if (live.length !== raw.sessions.length) {
      const liveHashes = new Set(live.map((entry) => entry.hash));
      raw.sessions = raw.sessions.filter((entry) => liveHashes.has(entry.hash));
      this.write(raw);
    }
    const known = new Set(raw.sessions.map((entry) => entry.hash));
    for (const hash of this.pending.keys()) {
      if (!known.has(hash)) {
        this.pending.delete(hash);
      }
    }
    return { raw, effective: live };
  }

  generation(): number {
    return this.read().generation;
  }

  // A new refresh token for a session; the token itself is returned once and kept nowhere.
  createRefresh(): string {
    const token = randomBytes(32).toString('base64url');
    const now = this.now();
    const { raw } = this.load();
    raw.sessions.push({ hash: hashOf(token), createdAt: now, lastUsedAt: now, expiresAt: now + REFRESH_WINDOW_MS });
    this.write(raw);
    return token;
  }

  private find(entries: SessionEntry[], token: string): SessionEntry | undefined {
    const wanted = Buffer.from(hashOf(token), 'hex');
    let found: SessionEntry | undefined;
    for (const entry of entries) {
      if (timingSafeEqual(Buffer.from(entry.hash, 'hex'), wanted)) {
        found = entry;
      }
    }
    return found;
  }

  // Whether the token is a live session. Does not extend it (the status of the interface asks this on every page load).
  findRefresh(token: string): boolean {
    return this.find(this.load().effective, token) !== undefined;
  }

  // Same, and the session now lasts REFRESH_WINDOW_MS from this moment.
  useRefresh(token: string): boolean {
    const { raw, effective } = this.load();
    const entry = this.find(effective, token);
    if (entry === undefined) {
      return false;
    }
    const now = this.now();
    this.pending.set(entry.hash, { lastUsedAt: now, expiresAt: now + REFRESH_WINDOW_MS });
    const stored = raw.sessions.find((candidate) => candidate.hash === entry.hash);
    if (stored !== undefined && now - stored.lastUsedAt >= SESSION_WRITE_THROTTLE_MS) {
      stored.lastUsedAt = now;
      stored.expiresAt = now + REFRESH_WINDOW_MS;
      this.write(raw);
    }
    return true;
  }

  // "Lock now": this refresh token is deleted and every access token issued so far stops working (generation + 1). Only a token that
  // is a live session does that: with none, or an unknown one, nothing changes and the answer is false (whoever can reach the port
  // must not be able to lock the user out).
  logout(token: string | undefined): boolean {
    const { raw, effective } = this.load();
    const entry = token === undefined ? undefined : this.find(effective, token);
    if (entry === undefined) {
      return false;
    }
    raw.generation += 1;
    raw.sessions = raw.sessions.filter((candidate) => candidate.hash !== entry.hash);
    this.pending.delete(entry.hash);
    this.write(raw);
    return true;
  }

  // A new PIN: nobody stays logged in (generation + 1, every refresh token deleted).
  revokeAll(): void {
    const { raw } = this.load();
    raw.generation += 1;
    raw.sessions = [];
    this.pending.clear();
    this.write(raw);
  }
}
