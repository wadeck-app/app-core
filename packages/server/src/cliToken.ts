import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './auth/atomicWrite.js';
import { getErrorMessage } from './errors.js';

// The machine token: a secret file next to the registry that the server creates and that the SDK's registerModule and the CLI read
// to prove "I run on this machine as this user" to POST /api/modules/register|update|unregister (see auth/registerGuard.ts).
// It is never logged and never returned by a route.
export const CLI_TOKEN_FILE = 'cli-token';
export const CLI_TOKEN_HEADER = 'X-App-Core-Token';

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export function cliTokenPath(configDir: string): string {
  return path.join(configDir, CLI_TOKEN_FILE);
}

// The token a sender puts in the header. Undefined when there is no file: a server older than the token never created one, and a
// sender that finds nothing sends nothing (the caller decides what that means). Throws when the file is there and cannot be used:
// sending nothing then would look like an older server and hide the real problem.
export function readCliToken(configDir: string): string | undefined {
  const file = cliTokenPath(configDir);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw new Error(`app-core machine token ${file} cannot be read: ${getErrorMessage(err)}. Fix the permissions of the file, or delete it and restart app-core so that it creates a new one.`);
  }
  const token = text.trim();
  if (token === '') {
    throw new Error(`app-core machine token ${file} is empty. Delete it and restart app-core so that it creates a new one.`);
  }
  return token;
}

// At startup: keeps the token that exists, creates one (32 random bytes, hex, mode 0600) when there is none. A file that holds
// anything else is not replaced silently: the user may have put it there, and every sender would stop matching.
export function ensureCliToken(configDir: string): string {
  const file = cliTokenPath(configDir);
  const existing = readCliToken(configDir);
  if (existing !== undefined) {
    if (!TOKEN_PATTERN.test(existing)) {
      throw new Error(`app-core machine token ${file} is not 64 hexadecimal characters. Delete the file (no other change needed) and start app-core again: it creates a new one.`);
    }
    return existing;
  }
  const token = randomBytes(32).toString('hex');
  writeFileAtomic(file, `${token}\n`);
  return token;
}
