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

  it('keeps the same data reference and does not re-render when a poll brings nothing new', async () => {
    // A fresh object each time, equal by value: what fetch + JSON.parse gives for an unchanged response.
    const fetchFn = vi.fn().mockImplementation(async () => ({ modules: ['a'] }));
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return usePolling({
        fetchFn,
        isEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
        isDocumentHidden: () => hidden,
        minIntervalMs: 1_000,
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    const first = result.current.data;
    const rendersAfterFirst = renders;
    expect(first).toEqual({ modules: ['a'] });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    // A new identity would remount whatever is keyed or defined from it (bound form fields lost focus on every poll).
    expect(result.current.data).toBe(first);
    expect(renders).toBe(rendersAfterFirst);
  });

  it('clears an earlier error when the next poll succeeds, even if the data is the same', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ v: 1 })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ v: 1 });
    const { result } = renderHook(() =>
      usePolling({ fetchFn, isEqual: (a, b) => a.v === b.v, isDocumentHidden: () => hidden, minIntervalMs: 1_000 }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(result.current.error).toBeInstanceOf(Error);
    const data = result.current.data;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(result.current.error).toBeUndefined();
    expect(result.current.data).toBe(data);
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
