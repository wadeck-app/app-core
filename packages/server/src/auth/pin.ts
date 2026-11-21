import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicWrite.js';
import { SessionStore } from './tokens.js';

// The PIN that unlocks the routes a module declares `sensitive`. Only its scrypt hash is stored, in `auth.json` in the app-core
// config dir. It is created or changed by `app-core-cli pin set` (this code, called locally) or by the dashboard over HTTP
// (POST /api/auth/pin/set only while no PIN exists, POST /api/auth/pin/change with the current PIN; see routes.ts).
//
// What this does not protect, said plainly:
//  - A process of the same user that can read auth.json can try PINs offline. scrypt makes each try slow (about a tenth of a
//    second here), it does not make a 4 to 12 character PIN safe (the user chose that range, D10).
//  - File modes: the file is written with mode 0600, which Node enforces on macOS and Linux. On Windows the mode is NOT enforced:
//    the file is readable by whoever can read your user profile (the same user, administrators).

export const MIN_PIN_LENGTH = 4;
// The longest PIN that can be chosen.
export const MAX_PIN_LENGTH = 12;
// What a request may carry as a PIN text: far above MAX_PIN_LENGTH so that a PIN chosen under an older, looser rule can still log in,
// while a request cannot make the server hash megabytes.
export const MAX_PIN_REQUEST_LENGTH = 256;

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

// The one rule for a NEW PIN (the CLI, the HTTP routes and setPin all use it): what is wrong with it, or undefined when it is fine.
export function pinProblem(pin: string): string | undefined {
  const length = Array.from(pin).length;
  if (length < MIN_PIN_LENGTH) {
    return `The PIN must have at least ${MIN_PIN_LENGTH} characters (got ${length}). Choose a longer one.`;
  }
  if (length > MAX_PIN_LENGTH) {
    return `The PIN must have at most ${MAX_PIN_LENGTH} characters (got ${length}).`;
  }
  return undefined;
}

// Answer of a sensitive route, and of the PIN routes, while no PIN exists.
export const PIN_NOT_SET_MESSAGE = 'No PIN is set yet. Choose one in the dashboard (a "Choose a PIN" dialog opens at the next sensitive action) or run "app-core-cli pin set" in a terminal.';

// The files to delete to go back to "no PIN set" by hand, with the instruction shown by the dashboard. Only auth.json: it is read at
// every request, so no restart is needed. auth-sessions.json is NOT listed on purpose: choosing a PIN revokes every session by raising
// its generation counter, and deleting that file would reset the counter, so an access token issued before (still within its 10
// minutes) could match the new generation again. The lockout counter is in memory (no file); choosing a PIN clears it.
export function pinResetHint(configDir: string): { files: string[]; instruction: string } {
  return { files: [authFilePath(configDir)], instruction: 'Delete this file (no restart needed), then choose a new PIN.' };
}

// Chooses or changes the PIN, and revokes every session (a new PIN logs everybody out). Atomic write.
export async function setPin(configDir: string, pin: string, now: () => number = Date.now): Promise<void> {
  const problem = pinProblem(pin);
  if (problem !== undefined) {
    throw new Error(problem);
  }
  const salt = randomBytes(SALT_BYTES);
  const hash = await derive(pin, salt, SCRYPT);
  const record: PinRecord = { algorithm: 'scrypt', ...SCRYPT, salt: salt.toString('base64'), hash: hash.toString('base64') };
  writeFileAtomic(authFilePath(configDir), JSON.stringify({ version: 1, pin: record }, null, 2));
  new SessionStore(configDir, now).revokeAll();
}
