// Brakes the guessing of the PIN. In memory, per server process (a restart clears it: the same-user process that could restart the
// server could also read auth.json, see pin.ts). One counter for the whole server: app-core has one user.
//
// Every block of 5 wrong tries starts a wait, growing with the block: 1 minute, 5 minutes, then 30 minutes for every block after.
// A request that arrives during the wait is refused without looking at the PIN, the right one included. A right PIN resets all.

export const TRIES_PER_BLOCK = 5;
export const WAITS_SECONDS = [60, 5 * 60, 30 * 60] as const;

export type LockState = { locked: false } | { locked: true; retryAfterSeconds: number };

export class PinLockout {
  private failures = 0;
  private lockedUntil = 0;

  // `now` returns epoch milliseconds; tests inject their own clock.
  constructor(private readonly now: () => number = Date.now) {}

  check(): LockState {
    const remainingMs = this.lockedUntil - this.now();
    return remainingMs > 0 ? { locked: true, retryAfterSeconds: Math.ceil(remainingMs / 1000) } : { locked: false };
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures % TRIES_PER_BLOCK === 0) {
      const block = this.failures / TRIES_PER_BLOCK;
      const wait = WAITS_SECONDS[Math.min(block, WAITS_SECONDS.length) - 1] ?? WAITS_SECONDS[WAITS_SECONDS.length - 1] ?? 1800;
      this.lockedUntil = this.now() + wait * 1000;
    }
  }

  recordSuccess(): void {
    this.failures = 0;
    this.lockedUntil = 0;
  }

  // Wrong tries left before the next wait begins.
  triesLeft(): number {
    return TRIES_PER_BLOCK - (this.failures % TRIES_PER_BLOCK);
  }

  // The wait the next block of wrong tries will cost, in seconds: said to the user so a wrong PIN is not a surprise.
  nextWaitSeconds(): number {
    const block = Math.floor(this.failures / TRIES_PER_BLOCK) + 1;
    return WAITS_SECONDS[Math.min(block, WAITS_SECONDS.length) - 1] ?? 1800;
  }
}
