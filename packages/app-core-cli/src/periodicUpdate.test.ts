import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECHECK_INTERVAL_MS, startPeriodicUpdate } from './periodicUpdate.js';

describe('startPeriodicUpdate', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts the updater again every 6 hours, not before', () => {
    const schedule = vi.fn();
    startPeriodicUpdate({ enabled: true, schedule });
    expect(RECHECK_INTERVAL_MS).toBe(6 * 3600 * 1000);
    vi.advanceTimersByTime(RECHECK_INTERVAL_MS - 1);
    expect(schedule).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(schedule).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(RECHECK_INTERVAL_MS);
    expect(schedule).toHaveBeenCalledTimes(2);
  });

  it('sets no timer when updates are off (--no-update)', () => {
    const schedule = vi.fn();
    const stop = startPeriodicUpdate({ enabled: false, schedule });
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(RECHECK_INTERVAL_MS * 2);
    expect(schedule).not.toHaveBeenCalled();
    stop();
  });

  it('says on stderr why a check could not be started, and keeps going', () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const schedule = vi.fn(() => {
      throw new Error('spawn EPERM');
    });
    startPeriodicUpdate({ enabled: true, schedule });
    vi.advanceTimersByTime(RECHECK_INTERVAL_MS * 2);
    expect(schedule).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenCalledWith(expect.stringContaining('spawn EPERM'));
    write.mockRestore();
  });

  it('stops with the returned function', () => {
    const schedule = vi.fn();
    const stop = startPeriodicUpdate({ enabled: true, schedule });
    stop();
    vi.advanceTimersByTime(RECHECK_INTERVAL_MS * 2);
    expect(schedule).not.toHaveBeenCalled();
  });

  it('does not keep the process alive', () => {
    const unref = vi.spyOn(globalThis, 'setInterval');
    startPeriodicUpdate({ enabled: true, schedule: () => undefined });
    const timer = unref.mock.results[0]?.value as NodeJS.Timeout;
    expect(timer.hasRef()).toBe(false);
    unref.mockRestore();
  });
});
