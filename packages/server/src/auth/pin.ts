import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicWrite.js';
import { SessionStore } from './tokens.js';

// The PIN that unlocks the routes a module declares `sensitive`. Only its scrypt hash is stored, in `auth.json` in the app-core
// config dir. It is created and changed only by `app-core-cli pin set` (this code, called locally): never over HTTP, so a process
// that can only send requests cannot choose it.
//
// What this does not protect, said plainly:
//  - A process of the same user that can read auth.json can try PINs offline. scrypt makes each try slow (about a tenth of a
//    second here), it does not make a 6-digit PIN safe: use a longer secret if that matters.
//  - File modes: the file is written with mode 0600, which Node enforces on macOS and Linux. On Windows the mode is NOT enforced:
//    the file is readable by whoever can read your user profile (the same user, administrators).

export const MIN_PIN_LENGTH = 6;
// Longer is refused before hashing: a request must not make the server hash megabytes.
export const MAX_PIN_LENGTH = 256;

const SCRYPT = { N: 32768, r: 8, p: 1, keyLength: 32 } as const;
const SALT_BYTES = 16;

interface PinRecord {
  algorithm: 'scrypt';
  N: number;
  r: number;
  p: number;
  keyLength: number;
  salt: string;
  hash: string;
}

export const authFilePath = (configDir: string): string => path.join(configDir, 'auth.json');

function derive(pin: string, salt: Buffer, params: { N: number; r: number; p: number; keyLength: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // maxmem: scrypt needs 128 * N * r bytes, Node's default ceiling (32 MiB) is exactly the cost of N = 32768, r = 8.
    scrypt(pin, salt, params.keyLength, { N: params.N, r: params.r, p: params.p, maxmem: 256 * params.N * params.r }, (err, key) => (err === null ? resolve(key) : reject(err)));
  });
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0;

function readRecord(configDir: string): PinRecord | undefined {
  const file = authFilePath(configDir);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw err;
  }
  let pin: Partial<PinRecord> | undefined;
  try {
    pin = (JSON.parse(text) as { pin?: Partial<PinRecord> } | null)?.pin;
  } catch {
    pin = undefined;
  }
  if (pin?.algorithm !== 'scrypt' || !isCount(pin.N) || !isCount(pin.r) || !isCount(pin.p) || !isCount(pin.keyLength) || typeof pin.salt !== 'string' || typeof pin.hash !== 'string') {
    throw new Error(`${file} is not valid (no scrypt PIN record in it). Run "app-core-cli pin set" to write it again; sensitive actions stay refused until then.`);
  }
  return pin as PinRecord;
}

// Whether a PIN was chosen. Throws, with the fix, when auth.json exists but is damaged: that is not "no PIN".
export function isPinSet(configDir: string): boolean {
  return readRecord(configDir) !== undefined;
}

// A wrong PIN is `false`; a missing PIN is an error (the caller says "run app-core-cli pin set").
export async function verifyPin(configDir: string, pin: string): Promise<boolean> {
  const record = readRecord(configDir);
  if (record === undefined) {
    throw new Error(`No PIN is set (${authFilePath(configDir)} does not exist). Run "app-core-cli pin set".`);
  }
  const expected = Buffer.from(record.hash, 'base64');
  const actual = await derive(pin, Buffer.from(record.salt, 'base64'), record);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Chooses or changes the PIN, and revokes every session (a new PIN logs everybody out). Atomic write.
export async function setPin(configDir: string, pin: string, now: () => number = Date.now): Promise<void> {
  const length = Array.from(pin).length;
  if (length < MIN_PIN_LENGTH) {
    throw new Error(`The PIN must have at least ${MIN_PIN_LENGTH} characters (got ${length}). Choose a longer one.`);
  }
  if (length > MAX_PIN_LENGTH) {
    throw new Error(`The PIN must have at most ${MAX_PIN_LENGTH} characters (got ${length}).`);
  }
  const salt = randomBytes(SALT_BYTES);
  const hash = await derive(pin, salt, SCRYPT);
  const record: PinRecord = { algorithm: 'scrypt', ...SCRYPT, salt: salt.toString('base64'), hash: hash.toString('base64') };
  writeFileAtomic(authFilePath(configDir), JSON.stringify({ version: 1, pin: record }, null, 2));
  new SessionStore(configDir, now).revokeAll();
}
