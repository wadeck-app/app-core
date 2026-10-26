import { useCallback, useEffect, useState } from 'react';

// How the user wants dates and times shown, kept in this browser (localStorage): app-core has no user account yet.
export const DATE_SETTINGS_KEY = 'app-core.dates';

export const AUTO_LOCALE = 'auto';
export const LOCAL_TIME_ZONE = 'local';

export const DATE_PRESETS = ['locale', 'iso'] as const;
export const HOUR_CYCLES = ['auto', '12h', '24h'] as const;
export const WEEK_STARTS = ['auto', 'monday', 'sunday', 'saturday'] as const;
export const WEEKDAY_STYLES = ['narrow', 'short', 'long'] as const;

export interface DateSettings {
  // A BCP 47 tag ("en-GB", "fr-FR"), or "auto" = the language of the browser. The default is English, never the browser's.
  locale: string;
  // "locale": the conventions of the language; "iso": 2026-10-24 18:38 (always 24h).
  preset: (typeof DATE_PRESETS)[number];
  // Only for the "locale" preset: "auto" follows the language.
  hourCycle: (typeof HOUR_CYCLES)[number];
  // "local" (the time zone of the computer), "UTC" or an IANA name ("Europe/Paris").
  timeZone: string;
  // First day of the week in calendars and weekday lists; "auto" follows the language.
  weekStart: (typeof WEEK_STARTS)[number];
  weekdayStyle: (typeof WEEKDAY_STYLES)[number];
}

// English with day-first dates and a 24h clock: what the tables already showed before the setting existed.
export const DEFAULT_DATE_SETTINGS: DateSettings = {
  locale: 'en-GB',
  preset: 'locale',
  hourCycle: 'auto',
  timeZone: LOCAL_TIME_ZONE,
  weekStart: 'auto',
  weekdayStyle: 'short',
};

function isOneOf<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

// Why `locale` cannot be used, or undefined when it can.
export function localeProblem(locale: string): string | undefined {
  if (locale === AUTO_LOCALE) {
    return undefined;
  }
  try {
    const [canonical] = Intl.getCanonicalLocales(locale);
    if (canonical === undefined || Intl.DateTimeFormat.supportedLocalesOf([canonical]).length === 0) {
      return `this browser has no date data for "${locale}"`;
    }
    return undefined;
  } catch {
    return `"${locale}" is not a language tag (examples: "en-GB", "fr-FR", "de")`;
  }
}

// Why `timeZone` cannot be used, or undefined when it can.
export function timeZoneProblem(timeZone: string): string | undefined {
  if (timeZone === LOCAL_TIME_ZONE) {
    return undefined;
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return undefined;
  } catch {
    return `"${timeZone}" is not a time zone (use "local", "UTC" or a name like "Europe/Paris")`;
  }
}

// Reads the stored value. Every field that is missing keeps its default; every field that is wrong keeps its default too and
// is reported in `problems`, so a corrupted value is said and never silently half applied.
export function parseDateSettings(raw: unknown): { settings: DateSettings; problems: string[] } {
  const problems: string[] = [];
  const settings: DateSettings = { ...DEFAULT_DATE_SETTINGS };
  if (raw === undefined || raw === null) {
    return { settings, problems };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { settings, problems: [`expected an object, got ${Array.isArray(raw) ? 'an array' : typeof raw}`] };
  }
  const given = raw as Record<string, unknown>;
  for (const key of Object.keys(given)) {
    if (!(key in DEFAULT_DATE_SETTINGS)) {
      problems.push(`"${key}" is not a date setting (known: ${Object.keys(DEFAULT_DATE_SETTINGS).join(', ')})`);
    }
  }
  const text = (key: 'locale' | 'timeZone', check: (value: string) => string | undefined): void => {
    const value = given[key];
    if (value === undefined) {
      return;
    }
    const why = typeof value !== 'string' ? 'must be a text' : check(value);
    if (why === undefined) {
      settings[key] = value as string;
    } else {
      problems.push(`"${key}": ${why}; using "${DEFAULT_DATE_SETTINGS[key]}"`);
    }
  };
  text('locale', localeProblem);
  text('timeZone', timeZoneProblem);
  const choice = <K extends 'preset' | 'hourCycle' | 'weekStart' | 'weekdayStyle'>(key: K, allowed: readonly DateSettings[K][]): void => {
    const value = given[key];
    if (value === undefined) {
      return;
    }
    if (isOneOf(allowed as readonly string[], value)) {
      settings[key] = value as DateSettings[K];
    } else {
      problems.push(`"${key}": ${JSON.stringify(value)} is not one of ${allowed.map((a) => `"${a}"`).join(', ')}; using "${DEFAULT_DATE_SETTINGS[key]}"`);
    }
  };
  choice('preset', DATE_PRESETS);
  choice('hourCycle', HOUR_CYCLES);
  choice('weekStart', WEEK_STARTS);
  choice('weekdayStyle', WEEKDAY_STYLES);
  return { settings, problems };
}

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
