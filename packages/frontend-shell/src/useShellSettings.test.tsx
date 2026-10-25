import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useShellSettings } from './useShellSettings.js';

const answer = (status: number, body: unknown): void => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }));
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useShellSettings', () => {
  it('is off until the server answers, then follows it', async () => {
    answer(200, { abTests: true });
    const { result } = renderHook(() => useShellSettings());
    expect(result.current.abTests).toBe(false);
    await waitFor(() => expect(result.current.abTests).toBe(true));
  });

  it('says why in the console and stays off when the server answers an error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    answer(404, { error: 'not-found' });
    const { result } = renderHook(() => useShellSettings());
    await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining('GET /api/shell-settings answered 404')));
    expect(result.current.abTests).toBe(false);
  });

  it('says so when the answer has no boolean abTests (a server older than the frontend)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    answer(200, {});
    renderHook(() => useShellSettings());
    await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining('older than this frontend')));
  });
});
