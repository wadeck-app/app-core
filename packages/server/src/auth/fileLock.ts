import * as fs from 'node:fs';
import * as path from 'node:path';

// A lock between processes for a read-change-write of one small file (auth-sessions.json: the server and `app-core-cli pin set` both
// change it). The lock is a file created with the exclusive flag next to it, holding the pid of its owner. Synchronous on purpose: the
// callers are synchronous, and a change takes milliseconds.

// A change takes milliseconds: a lock this old is a leftover (a hung or killed owner, a pid that was reused), whatever its pid says.
export const STALE_LOCK_MS = 60_000;
export const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
const RETRY_MS = 10;

interface LockOwner {
  pid?: unknown;
  at?: unknown;
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: it exists, it is not ours to signal.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function ownerOf(lockFile: string): LockOwner {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? (parsed as LockOwner) : {};
  } catch {
    // Empty or half written: its writer may be between creating and filling it.
    return {};
  }
}

// Left behind by a process that is gone, or too old to be a change in progress. A fresh lock whose content cannot be read is not stale.
function isStale(lockFile: string): boolean {
  let age: number;
  try {
    age = Date.now() - fs.statSync(lockFile).mtimeMs;
  } catch {
    // Released between the failed creation and now: nothing to take over, the next try creates it.
    return false;
  }
  if (age > STALE_LOCK_MS) {
    return true;
  }
  const { pid } = ownerOf(lockFile);
  return typeof pid === 'number' && Number.isInteger(pid) && pid > 0 && !isAlive(pid);
}

function describeOwner(lockFile: string): string {
  const { pid, at } = ownerOf(lockFile);
  return typeof pid === 'number' ? `held by pid ${pid}${typeof at === 'string' ? ` since ${at}` : ''}` : 'held by a process that did not say who it is';
}

export function withFileLock<T>(lockFile: string, timeoutMs: number, fn: () => T): T {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const fd = fs.openSync(lockFile, 'wx', 0o600);
      try {
        fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      } finally {
        fs.closeSync(fd);
      }
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw err;
      }
    }
    if (isStale(lockFile)) {
      fs.rmSync(lockFile, { force: true });
      continue;
    }
    if (Date.now() >= deadline) {
      throw new Error(`Could not change ${path.basename(lockFile, '.lock')} within ${timeoutMs} ms: ${lockFile} is ${describeOwner(lockFile)}. If that process is gone, delete ${lockFile}.`);
    }
    sleep(RETRY_MS);
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lockFile, { force: true });
  }
}
