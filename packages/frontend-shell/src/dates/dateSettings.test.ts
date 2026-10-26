import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DATE_SETTINGS_KEY, DEFAULT_DATE_SETTINGS, parseDateSettings, useDateSettings } from './dateSettings.js';

describe('parseDateSettings', () => {
  it('gives the defaults, without a problem, when nothing is stored', () => {
    expect(parseDateSettings(undefined)).toEqual({ settings: DEFAULT_DATE_SETTINGS, problems: [] });
    expect(parseDateSettings(null)).toEqual({ settings: DEFAULT_DATE_SETTINGS, problems: [] });
  });

  it('defaults to English, not to the language of the browser', () => {
    expect(DEFAULT_DATE_SETTINGS.locale).toBe('en-GB');
  });

  it('keeps what is valid and fills the rest with defaults', () => {
    const { settings, problems } = parseDateSettings({ locale: 'fr-FR', timeZone: 'Europe/Paris', hourCycle: '24h' });
    expect(settings).toEqual({ ...DEFAULT_DATE_SETTINGS, locale: 'fr-FR', timeZone: 'Europe/Paris', hourCycle: '24h' });
    expect(problems).toEqual([]);
  });

  it('accepts auto for the language and local or UTC for the zone', () => {
    expect(parseDateSettings({ locale: 'auto', timeZone: 'UTC' }).problems).toEqual([]);
    expect(parseDateSettings({ timeZone: 'local' }).problems).toEqual([]);
  });

  it('names each wrong field, what is expected, and the value used instead', () => {
    const { settings, problems } = parseDateSettings({ locale: 'not a locale!', timeZone: 'Mars/Olympus', preset: 'weird', weekStart: 3, extra: 1 });
    expect(settings).toEqual(DEFAULT_DATE_SETTINGS);
    expect(problems).toEqual([
      '"extra" is not a date setting (known: locale, preset, hourCycle, timeZone, weekStart, weekdayStyle)',
      '"locale": "not a locale!" is not a language tag (examples: "en-GB", "fr-FR", "de"); using "en-GB"',
      '"timeZone": "Mars/Olympus" is not a time zone (use "local", "UTC" or a name like "Europe/Paris"); using "local"',
      '"preset": "weird" is not one of "locale", "iso"; using "locale"',
      '"weekStart": 3 is not one of "auto", "monday", "sunday", "saturday"; using "auto"',
    ]);
  });

  it('refuses a value that is not an object', () => {
    expect(parseDateSettings('x').problems).toEqual(['expected an object, got string']);
    expect(parseDateSettings([]).problems).toEqual(['expected an object, got an array']);
  });
});

describe('useDateSettings', () => {
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
