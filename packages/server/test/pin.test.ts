import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { authFilePath, isPinSet, MAX_PIN_LENGTH, MIN_PIN_LENGTH, pinProblem, pinResetHint, setPin, verifyPin } from '../src/auth/pin.js';
import { SessionStore } from '../src/auth/tokens.js';

describe('PIN storage', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-pin-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('has no PIN until one is set', () => {
    expect(isPinSet(dir)).toBe(false);
  });

  it('stores a scrypt hash with its parameters and a random salt, never the PIN', async () => {
    await setPin(dir, '123456');
    const raw = fs.readFileSync(authFilePath(dir), 'utf8');
    expect(raw).not.toContain('123456');
    const record = JSON.parse(raw) as { pin: Record<string, unknown> };
    expect(record.pin).toMatchObject({ algorithm: 'scrypt', N: expect.any(Number), r: expect.any(Number), p: expect.any(Number), keyLength: 32 });
    expect(Buffer.from(record.pin['salt'] as string, 'base64')).toHaveLength(16);
    expect(isPinSet(dir)).toBe(true);
  });

  it('uses a different salt (so a different hash) each time', async () => {
    await setPin(dir, '123456');
    const first = fs.readFileSync(authFilePath(dir), 'utf8');
    await setPin(dir, '123456');
    expect(fs.readFileSync(authFilePath(dir), 'utf8')).not.toBe(first);
  });

  it('verifies the right PIN and refuses a wrong one', async () => {
    await setPin(dir, 'correct pony');
    expect(await verifyPin(dir, 'correct pony')).toBe(true);
    expect(await verifyPin(dir, 'correct ponz')).toBe(false);
    expect(await verifyPin(dir, '')).toBe(false);
  });

  it('refuses a new PIN shorter than the minimum, saying how long it must be', async () => {
    expect(MIN_PIN_LENGTH).toBe(4);
    await expect(setPin(dir, '123')).rejects.toThrow(/at least 4 characters/);
    expect(isPinSet(dir)).toBe(false);
  });

  it('pinProblem is the one rule for a new PIN (the CLI and the routes use it): length in characters, minimum 4 and maximum 12', () => {
    expect(MAX_PIN_LENGTH).toBe(12);
    expect(pinProblem('1234')).toBeUndefined();
    expect(pinProblem('123')).toMatch(/at least 4 characters \(got 3\)/);
    // Counted in characters, not in UTF-16 units: four emoji are four characters.
    expect(pinProblem('😀😀😀😀')).toBeUndefined();
    expect(pinProblem('x'.repeat(MAX_PIN_LENGTH))).toBeUndefined();
    expect(pinProblem('x'.repeat(MAX_PIN_LENGTH + 1))).toMatch(/at most 12 characters \(got 13\)/);
  });

  it('says what to do when auth.json is not valid, instead of treating it as "no PIN"', async () => {
    fs.writeFileSync(authFilePath(dir), '{not json');
    expect(() => isPinSet(dir)).toThrow(/auth\.json.*not valid.*app-core-cli pin set/s);
    await expect(verifyPin(dir, '123456')).rejects.toThrow(/auth\.json/);
  });

  it('revokes the sessions BEFORE writing the new PIN: a crash in between must not leave old sessions valid with the new PIN', async () => {
    const store = new SessionStore(dir);
    const token = store.createRefresh();
    // A directory in place of auth.json makes the write fail, as a crash right after the revoke would.
    fs.mkdirSync(authFilePath(dir));
    await expect(setPin(dir, '123456')).rejects.toThrow();
    expect(store.generation()).toBe(1);
    expect(store.findRefresh(token)).toBe(false);
  });

  it('leaves no temporary file behind (atomic write)', async () => {
    await setPin(dir, '123456');
    expect(fs.readdirSync(dir).filter((f) => f.includes('.tmp'))).toEqual([]);
  });

  it('writes the file with mode 0600 where the platform enforces modes', async () => {
    await setPin(dir, '123456');
    if (process.platform === 'win32') {
      // Windows ignores POSIX modes: the file is protected by the ACL of the user profile only.
      return;
    }
    expect(fs.statSync(authFilePath(dir)).mode & 0o777).toBe(0o600);
  });

  it('the reset hint lists auth.json only: deleting auth-sessions.json too would reset the generation counter, so an old access token could match again', async () => {
    expect(pinResetHint(dir).files).toEqual([authFilePath(dir)]);
    const store = new SessionStore(dir, () => 1_000_000);
    await setPin(dir, '123456');
    const generationOfOldToken = store.generation();
    fs.rmSync(path.join(dir, 'auth.json'));
    fs.rmSync(path.join(dir, 'auth-sessions.json'));
    await setPin(dir, '654321');
    expect(store.generation()).toBe(generationOfOldToken);
  });

  it('revokes every session when a new PIN is set (generation changes, refresh tokens are gone)', async () => {
    const store = new SessionStore(dir, () => 1_000_000);
    const token = store.createRefresh();
    const before = store.generation();
    await setPin(dir, '654321');
    const after = new SessionStore(dir, () => 1_000_000);
    expect(after.generation()).toBe(before + 1);
    expect(after.findRefresh(token)).toBe(false);
  });
});
