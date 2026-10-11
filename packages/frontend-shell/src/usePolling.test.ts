import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePolling } from './usePolling.js';

describe('usePolling (exponential backoff + hibernate on blur)', () => {
  let hidden = false;

  beforeEach(() => {
    vi.useFakeTimers();
    hidden = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls immediately on mount', async () => {
    const fetchFn = vi.fn().mockResolvedValue(1);
    renderHook(() =>
      usePolling({ fetchFn, isEqual: (a, b) => a === b, isDocumentHidden: () => hidden }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('backs off exponentially while the response is unchanged', async () => {
    const fetchFn = vi.fn().mockResolvedValue('same');
    renderHook(() =>
      usePolling({
        fetchFn,
        isEqual: (a, b) => a === b,
        isDocumentHidden: () => hidden,
        minIntervalMs: 1_000,
        maxIntervalMs: 8_000,
        backoffFactor: 2,
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // 1st re-poll after minIntervalMs (1s) -- still unchanged -> next delay doubles to 2s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);

    // Next poll should be scheduled ~2s out, not 1s -- advancing only 1s must not trigger it yet.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('resets to the fast interval when the response changes', async () => {
    const responses = ['a', 'a', 'b', 'b', 'b'];
    let i = 0;
    const fetchFn = vi.fn().mockImplementation(() => Promise.resolve(responses[i++]));
    renderHook(() =>
      usePolling({
        fetchFn,
        isEqual: (a, b) => a === b,
        isDocumentHidden: () => hidden,
        minIntervalMs: 1_000,
        maxIntervalMs: 8_000,
        backoffFactor: 2,
      }),
    );
    await act(async () => {
      await Promise.resolve();
    }); // call #1 -> 'a' (first value, treated as changed from undefined), next delay = min = 1000

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    }); // call #2 -> 'a' again, unchanged -> next delay doubles to 2000
    expect(fetchFn).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    }); // call #3 -> 'b', changed -> next delay resets to 1000
    expect(fetchFn).toHaveBeenCalledTimes(3);

    // If backoff had NOT reset, next poll would be scheduled 2000ms out; confirm it fires at 1000ms instead.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('hibernates (skips fetching) while the document is hidden', async () => {
    const fetchFn = vi.fn().mockResolvedValue('x');
    renderHook(() =>
      usePolling({
        fetchFn,
        isEqual: (a, b) => a === b,
        isDocumentHidden: () => hidden,
        minIntervalMs: 1_000,
        hibernateIntervalMs: 100_000,
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    hidden = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    // Still hidden at the 1s mark -- must NOT have fetched again (hibernating).
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Still hidden well past the normal interval -- confirms it's hibernating,
    // not just mid-backoff: a full hibernateIntervalMs passes with no fetch
    // as long as isDocumentHidden() keeps reporting true.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100_000);
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Once no longer hidden, the next scheduled hibernate check sees it and fetches.
    hidden = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100_000);
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('resumes fast polling immediately on visibilitychange back to visible', async () => {
    const fetchFn = vi.fn().mockResolvedValue('x');
    renderHook(() =>
      usePolling({
        fetchFn,
        isEqual: (a, b) => a === b,
        isDocumentHidden: () => hidden,
        minIntervalMs: 1_000,
        hibernateIntervalMs: 100_000,
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(fetchFn).toHaveBeenCalledTimes(1); // still hibernating, hidden stayed true

    hidden = false;
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(fetchFn).toHaveBeenCalledTimes(2); // immediate re-poll on regaining focus
  });
});
