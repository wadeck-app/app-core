import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_DATE_SETTINGS, parseDateSettings, type DateSettings } from '@wadeck-app/dsl-ui';

// How the user wants dates and times shown, kept in this browser (localStorage): app-core has no user account yet. The settings
// themselves (their type, defaults, validation) and the formatter built from them belong to dsl-ui.
export const DATE_SETTINGS_KEY = 'app-core.dates';

function read(): DateSettings {
  let stored: string | null;
  try {
    stored = window.localStorage.getItem(DATE_SETTINGS_KEY);
  } catch (err) {
    console.warn(`[dates] cannot read "${DATE_SETTINGS_KEY}" from localStorage: ${String(err)}. Dates use the default settings.`);
    return { ...DEFAULT_DATE_SETTINGS };
  }
  if (stored === null) {
    return { ...DEFAULT_DATE_SETTINGS };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch (err) {
    console.warn(`[dates] "${DATE_SETTINGS_KEY}" in localStorage is not valid JSON (${String(err)}). Dates use the default settings; saving a setting replaces it.`);
    return { ...DEFAULT_DATE_SETTINGS };
  }
  const { settings, problems } = parseDateSettings(parsed);
  for (const problem of problems) {
    console.warn(`[dates] "${DATE_SETTINGS_KEY}": ${problem}`);
  }
  return settings;
}

// The date settings of the user, shared by every tab of this browser: a change made in one tab reaches the others.
export function useDateSettings(): { settings: DateSettings; update: (change: Partial<DateSettings>) => void; reset: () => void; customized: boolean } {
  const [settings, setSettings] = useState<DateSettings>(read);

  const save = useCallback((next: DateSettings) => {
    setSettings(next);
    try {
      window.localStorage.setItem(DATE_SETTINGS_KEY, JSON.stringify(next));
    } catch (err) {
      console.warn(`[dates] cannot save "${DATE_SETTINGS_KEY}" to localStorage: ${String(err)}. The settings come back to the default after a reload.`);
    }
  }, []);

  const update = useCallback((change: Partial<DateSettings>) => save({ ...settings, ...change }), [save, settings]);
  const reset = useCallback(() => save({ ...DEFAULT_DATE_SETTINGS }), [save]);

  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key === DATE_SETTINGS_KEY || event.key === null) {
        setSettings(read());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const customized = (Object.keys(DEFAULT_DATE_SETTINGS) as Array<keyof DateSettings>).some((key) => settings[key] !== DEFAULT_DATE_SETTINGS[key]);
  return { settings, update, reset, customized };
}
