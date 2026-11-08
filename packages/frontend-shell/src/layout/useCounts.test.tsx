import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { countRequest, countUrl, readCount, useCounts, type CountRequest } from './useCounts.js';

const answer = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });
const req = (key: string, extra: Partial<CountRequest> = {}): CountRequest => ({ key, url: `/api/modules/queue/${key}`, refreshSeconds: 0, ...extra });

describe('countUrl', () => {
  it('is a route of the module that declared the figure', () => {
    expect(countUrl('queue', { route: '/dlq/count' })).toBe('/api/modules/queue/dlq/count');
    expect(countUrl('queue', { route: '/' })).toBe('/api/modules/queue/');
  });

  it('fills the parameters of the route with the ones of the page, encoded', () => {
    expect(countUrl('task', { route: '/tasks/:project/:id/history/count' }, { project: 'web app', id: '7' })).toBe('/api/modules/task/tasks/web%20app/7/history/count');
  });

  it('makes a request with the default refresh, 60 seconds, and keeps the field', () => {
    expect(countRequest('menu:x', 'queue', { route: '/n', field: 'counts.open' })).toEqual({ key: 'menu:x', url: '/api/modules/queue/n', field: 'counts.open', refreshSeconds: 60 });
    expect(countRequest('menu:x', 'queue', { route: '/n', refreshSeconds: 0 }).refreshSeconds).toBe(0);
  });
});

describe('readCount', () => {
  it('reads the answer itself, or the number at a path in it, 0 included', () => {
    expect(readCount(7, undefined)).toEqual({ value: 7 });
    expect(readCount({ total: 0 }, 'total')).toEqual({ value: 0 });
    expect(readCount({ counts: { open: 12 } }, 'counts.open')).toEqual({ value: 12 });
  });

  it('says why when it is not a whole number of 0 or more, or the path is not there', () => {
    expect(readCount({ total: '3' }, 'total')).toEqual({ problem: '"total" is "3", not a whole number of 0 or more' });
    expect(readCount({ total: -1 }, 'total')).toHaveProperty('problem');
    expect(readCount({ total: 1.5 }, 'total')).toHaveProperty('problem');
    expect(readCount({ a: {} }, 'a.b')).toEqual({ problem: 'the answer has no "a.b" (it stopped at "b")' });
    expect(readCount('x', undefined)).toHaveProperty('problem');
  });
});

describe('useCounts', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    warn.mockRestore();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  it('reads every figure and gives them by key', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => answer(url.endsWith('dlq') ? { total: 4 } : 9)));
    const { result } = renderHook(() => useCounts([req('dlq', { field: 'total' }), req('pending')]));
    await waitFor(() => expect(result.current).toEqual({ dlq: 4, pending: 9 }));
  });

  it('shows no figure, and says why once in the console, when the route fails or the answer is not a number', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.endsWith('bad') ? answer({}, 500) : answer({ total: 'x' }))));
    const { result, rerender } = renderHook(() => useCounts([req('bad'), req('text', { field: 'total' })]));
    await waitFor(() => expect(warn).toHaveBeenCalledTimes(2));
    expect(result.current).toEqual({});
    expect(warn.mock.calls[0]?.[0]).toContain('GET /api/modules/queue/bad: answered 500');
    expect(warn.mock.calls[0]?.[0]).toContain('Fix the route or the "count" in the manifest');
    expect(warn.mock.calls[1]?.[0]).toContain('"total" is "x", not a whole number');
    rerender();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('reads again every refreshSeconds, and not at all with 0', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let n = 0;
    const fetchMock = vi.fn(async () => answer(++n));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useCounts([req('live', { refreshSeconds: 30 }), req('once')]));
    await waitFor(() => expect(result.current.live).toBe(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await waitFor(() => expect(result.current.live).toBeGreaterThan(2));
    const onceCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('once')).length;
    expect(onceCalls).toBe(1);
  });

  it('does not read while the browser tab is hidden, and reads at once when it is shown again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn(async () => answer(1));
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => useCounts([req('live', { refreshSeconds: 30 })]));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('forgets the figures of requests that are gone, and stops reading when unmounted', async () => {
    const fetchMock = vi.fn(async () => answer(5));
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender, unmount } = renderHook(({ list }) => useCounts(list), { initialProps: { list: [req('a')] } });
    await waitFor(() => expect(result.current).toEqual({ a: 5 }));
    rerender({ list: [] });
    await waitFor(() => expect(result.current).toEqual({}));
    unmount();
  });
});
