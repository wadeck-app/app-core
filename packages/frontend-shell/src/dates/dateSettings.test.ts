import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DATE_SETTINGS } from '@wadeck-app/dsl-ui';
import { DATE_SETTINGS_KEY, useDateSettings } from './dateSettings.js';

describe('useDateSettings', () => {
  it('defaults to English, not to the language of the browser', () => {
    expect(DEFAULT_DATE_SETTINGS.locale).toBe('en-GB');
  });

  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with the defaults and is not customized', () => {
    const { result } = renderHook(() => useDateSettings());
    expect(result.current.settings).toEqual(DEFAULT_DATE_SETTINGS);
    expect(result.current.customized).toBe(false);
  });

  it('saves a change in this browser and gives the defaults back on reset', () => {
    const { result } = renderHook(() => useDateSettings());
    act(() => result.current.update({ locale: 'fr-FR', preset: 'iso' }));
    expect(result.current.customized).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(DATE_SETTINGS_KEY) ?? '{}')).toEqual({ ...DEFAULT_DATE_SETTINGS, locale: 'fr-FR', preset: 'iso' });

    const reloaded = renderHook(() => useDateSettings());
    expect(reloaded.result.current.settings.locale).toBe('fr-FR');

    act(() => result.current.reset());
    expect(result.current.settings).toEqual(DEFAULT_DATE_SETTINGS);
  });

  it('says what is wrong in the stored value and uses the defaults for it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.localStorage.setItem(DATE_SETTINGS_KEY, JSON.stringify({ timeZone: 'Mars/Olympus', locale: 'fr-FR' }));
    const { result } = renderHook(() => useDateSettings());
    expect(result.current.settings).toEqual({ ...DEFAULT_DATE_SETTINGS, locale: 'fr-FR' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"timeZone": "Mars/Olympus" is not a time zone'));
  });

  it('says so when the stored value is not JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.localStorage.setItem(DATE_SETTINGS_KEY, '{nope');
    const { result } = renderHook(() => useDateSettings());
    expect(result.current.settings).toEqual(DEFAULT_DATE_SETTINGS);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('is not valid JSON'));
  });

  it('follows a change made in another tab', () => {
    const { result } = renderHook(() => useDateSettings());
    act(() => {
      window.localStorage.setItem(DATE_SETTINGS_KEY, JSON.stringify({ locale: 'de' }));
      window.dispatchEvent(new StorageEvent('storage', { key: DATE_SETTINGS_KEY }));
    });
    expect(result.current.settings.locale).toBe('de');
  });
});
