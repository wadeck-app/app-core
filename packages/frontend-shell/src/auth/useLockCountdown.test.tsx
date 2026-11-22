import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLockCountdown } from './useLockCountdown.js';

describe('useLockCountdown', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('counts down, then stops its timer once the wait is over (no re-render twice a second for nothing)', () => {
    const { result } = renderHook(() => useLockCountdown());
    act(() => result.current.lock(2));
    expect(result.current.locked).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.locked).toBe(false);
    expect(result.current.remaining).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
