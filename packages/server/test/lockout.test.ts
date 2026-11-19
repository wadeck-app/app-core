import { describe, expect, it } from 'vitest';
import { PinLockout } from '../src/auth/lockout.js';

describe('PinLockout', () => {
  const make = () => {
    const clock = { now: 1_000_000 };
    return { clock, lockout: new PinLockout(() => clock.now) };
  };
  const fail = (lockout: PinLockout, times: number): void => {
    for (let i = 0; i < times; i++) {
      lockout.recordFailure();
    }
  };

  it('allows tries until the fifth wrong one', () => {
    const { lockout } = make();
    fail(lockout, 4);
    expect(lockout.check()).toEqual({ locked: false });
    lockout.recordFailure();
    expect(lockout.check()).toEqual({ locked: true, retryAfterSeconds: 60 });
  });

  it('counts the seconds down and unlocks when the wait ends', () => {
    const { clock, lockout } = make();
    fail(lockout, 5);
    clock.now += 20_500;
    expect(lockout.check()).toEqual({ locked: true, retryAfterSeconds: 40 });
    clock.now += 39_500;
    expect(lockout.check()).toEqual({ locked: false });
  });

  it('waits 1 minute, then 5, then 30 minutes (30 for every block after)', () => {
    const { clock, lockout } = make();
    const waits: number[] = [];
    for (let block = 0; block < 4; block++) {
      fail(lockout, 5);
      const state = lockout.check();
      waits.push(state.locked ? state.retryAfterSeconds : -1);
      clock.now += 31 * 60_000;
    }
    expect(waits).toEqual([60, 300, 1800, 1800]);
  });

  it('a correct PIN resets the count and the growing waits', () => {
    const { clock, lockout } = make();
    fail(lockout, 5);
    clock.now += 61_000;
    lockout.recordSuccess();
    fail(lockout, 4);
    expect(lockout.check()).toEqual({ locked: false });
    lockout.recordFailure();
    expect(lockout.check()).toEqual({ locked: true, retryAfterSeconds: 60 });
  });

  it('reports the number of tries left before the next wait', () => {
    const { lockout } = make();
    expect(lockout.triesLeft()).toBe(5);
    fail(lockout, 2);
    expect(lockout.triesLeft()).toBe(3);
  });
});
