import { AUTO_LOCALE, LOCAL_TIME_ZONE, type DateSettings } from './dateSettings.js';

// What a view or a module component asks to show: a Date, epoch milliseconds, or text (ISO 8601 is the safe one; a date
// without a time, "2026-10-24", is read as UTC midnight, as JavaScript does).
export type DateInput = Date | number | string;
export type DateStyle = 'short' | 'medium' | 'long';
export type DatePart = 'datetime' | 'date' | 'time';
export type NameStyle = 'narrow' | 'short' | 'long';

// The one service every date of the app goes through. Text only (no colors, no weights); the same settings apply to
// tables, widgets, charts and logs. An invalid value is returned as it came (so it stays visible) and said once in the console.
export interface DateFormatter {
  // Resolved settings: a BCP 47 tag, and an IANA zone name or "UTC". Never "auto" or "local".
  readonly locale: string;
  readonly timeZone: string;
  // 0 = Sunday ... 6 = Saturday.
  readonly firstDayOfWeek: number;
  // Changes when anything above or the format changes: a memo/effect dependency.
  readonly key: string;
  // short  24/10/2026, 18:38        medium  24 Oct 2026, 18:38:05        long  Saturday 24 October 2026 at 18:38:05 CEST
  // (iso preset: 2026-10-24 18:38 | 2026-10-24 18:38:05 | 2026-10-24 18:38:05+02:00). Default: medium datetime.
  format(value: DateInput, style?: DateStyle, part?: DatePart): string;
  // The exact instant, for a tooltip: ISO 8601 with milliseconds and offset, then the zone: 2026-10-24T18:38:05.123+02:00 (Europe/Paris).
  exact(value: DateInput): string;
  // "5 minutes ago", "yesterday", "in 2 hours", in the language of the settings.
  relative(value: DateInput, now?: number): string;
  // Seven names starting at the first day of the week, twelve names starting at January.
  weekdays(style?: NameStyle): string[];
  months(style?: NameStyle): string[];
  // An Intl.DateTimeFormat with the locale, the time zone and the hour cycle of the settings; for charts and anything the
  // styles above do not cover.
  intl(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat;
}

const DATE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  short: { day: '2-digit', month: '2-digit', year: 'numeric' },
  medium: { day: 'numeric', month: 'short', year: 'numeric' },
  long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
};
const TIME_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  short: { hour: '2-digit', minute: '2-digit' },
  medium: { hour: '2-digit', minute: '2-digit', second: '2-digit' },
  long: { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' },
};

// A reference week starting on a Sunday (2024-01-07), at noon UTC so that no zone moves it to another day.
const REFERENCE_SUNDAY = Date.UTC(2024, 0, 7, 12);
const DAY_MS = 24 * 3600 * 1000;

const warned = new Set<string>();
// Says a problem once per distinct message: a table of 500 bad cells must not print 500 lines.
function warnOnce(message: string): void {
  if (!warned.has(message) && warned.size < 200) {
    warned.add(message);
    console.warn(message);
  }
}

function resolveLocale(locale: string): string {
  if (locale !== AUTO_LOCALE) {
    return locale;
  }
  const fromBrowser = typeof navigator === 'undefined' ? undefined : (navigator.languages?.[0] ?? navigator.language);
  if (fromBrowser === undefined || fromBrowser === '') {
    warnOnce('[dates] locale is "auto" but the browser does not say its language; using "en-GB". Pick a language in the date settings.');
    return 'en-GB';
  }
  return fromBrowser;
}

function resolveTimeZone(timeZone: string): string {
  return timeZone === LOCAL_TIME_ZONE ? Intl.DateTimeFormat().resolvedOptions().timeZone : timeZone;
}

// 0 = Sunday ... 6 = Saturday.
function resolveFirstDay(weekStart: DateSettings['weekStart'], locale: string): number {
  if (weekStart !== 'auto') {
    return { monday: 1, sunday: 0, saturday: 6 }[weekStart];
  }
  // `getWeekInfo()` is the standard form; `weekInfo` is the older getter some engines still have (neither is in the TypeScript
  // lib yet). firstDay: 1 = Monday ... 7 = Sunday.
  const tag = new Intl.Locale(locale) as { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
  const info = typeof tag.getWeekInfo === 'function' ? tag.getWeekInfo() : tag.weekInfo;
  if (info === undefined) {
    warnOnce(`[dates] this browser cannot tell the first day of the week for "${locale}"; using Monday. Set it in the date settings.`);
    return 1;
  }
  return info.firstDay % 7;
}

export function createDateFormatter(settings: DateSettings): DateFormatter {
  const locale = resolveLocale(settings.locale);
  const timeZone = resolveTimeZone(settings.timeZone);
  const firstDayOfWeek = resolveFirstDay(settings.weekStart, locale);
  const iso = settings.preset === 'iso';
  const key = JSON.stringify([locale, timeZone, firstDayOfWeek, settings.preset, settings.hourCycle]);

  // The 12h/24h choice only exists for the language conventions; "iso" is a 24h clock.
  const hourOptions: Intl.DateTimeFormatOptions = iso || settings.hourCycle === '24h' ? { hourCycle: 'h23' } : settings.hourCycle === '12h' ? { hourCycle: 'h12' } : {};

  const cache = new Map<string, Intl.DateTimeFormat>();
  const intl = (options: Intl.DateTimeFormatOptions, forLocale: string = locale): Intl.DateTimeFormat => {
    const id = JSON.stringify([forLocale, options]);
    let found = cache.get(id);
    if (found === undefined) {
      found = new Intl.DateTimeFormat(forLocale, { timeZone, ...hourOptions, ...options });
      cache.set(id, found);
    }
    return found;
  };

  const toDate = (value: DateInput): Date | undefined => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      warnOnce(`[dates] ${JSON.stringify(value)} is not a date; showing it as it is. Give a Date, epoch milliseconds or an ISO 8601 text.`);
      return undefined;
    }
    return date;
  };

  // Year, month, ... and offset of an instant in the chosen zone, from a fixed locale so that the numbers are always Latin digits.
  const isoParts = (date: Date): { day: string; hm: string; hms: string; ms: string; offset: string } => {
    const parts = intl(
      { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, timeZoneName: 'longOffset', hourCycle: 'h23' },
      'en-US',
    ).formatToParts(date);
    const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
    // "GMT+02:00" -> "+02:00". UTC comes as plain "GMT" in some engines and as "GMT+00:00" in others: both are "Z".
    const offsetName = get('timeZoneName').replace('GMT', '');
    const offset = offsetName === '' || /^[+-]00:00$/.test(offsetName) ? 'Z' : offsetName;
    return {
      day: `${get('year')}-${get('month')}-${get('day')}`,
      hm: `${get('hour')}:${get('minute')}`,
      hms: `${get('hour')}:${get('minute')}:${get('second')}`,
      ms: get('fractionalSecond'),
      offset,
    };
  };

  const formatIso = (date: Date, style: DateStyle, part: DatePart): string => {
    const p = isoParts(date);
    const time = style === 'short' ? p.hm : style === 'medium' ? p.hms : `${p.hms}${p.offset}`;
    return part === 'date' ? p.day : part === 'time' ? time : `${p.day} ${time}`;
  };

  const format = (value: DateInput, style: DateStyle = 'medium', part: DatePart = 'datetime'): string => {
    const date = toDate(value);
    if (date === undefined) {
      return String(value);
    }
    if (iso) {
      return formatIso(date, style, part);
    }
    const options = { ...(part === 'time' ? {} : DATE_OPTIONS[style]), ...(part === 'date' ? {} : TIME_OPTIONS[style]) };
    return intl(options).format(date);
  };

  const exact = (value: DateInput): string => {
    const date = toDate(value);
    if (date === undefined) {
      return String(value);
    }
    const p = isoParts(date);
    return `${p.day}T${p.hms}.${p.ms}${p.offset} (${timeZone})`;
  };

  const relative = (value: DateInput, now: number = Date.now()): string => {
    const date = toDate(value);
    if (date === undefined) {
      return String(value);
    }
    const seconds = (date.getTime() - now) / 1000;
    const abs = Math.abs(seconds);
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (abs < 45) {
      return rtf.format(0, 'second');
    }
    const steps: Array<[number, Intl.RelativeTimeFormatUnit, number]> = [
      [45 * 60, 'minute', 60],
      [22 * 3600, 'hour', 3600],
      [26 * 86400, 'day', 86400],
      [320 * 86400, 'month', 30 * 86400],
    ];
    for (const [limit, unit, size] of steps) {
      if (abs < limit) {
        return rtf.format(Math.round(seconds / size), unit);
      }
    }
    return rtf.format(Math.round(seconds / (365 * 86400)), 'year');
  };

  const weekdays = (style: NameStyle = settings.weekdayStyle): string[] => {
    const names = Array.from({ length: 7 }, (_, day) => intl({ weekday: style, timeZone: 'UTC' }).format(new Date(REFERENCE_SUNDAY + day * DAY_MS)));
    return Array.from({ length: 7 }, (_, i) => names[(firstDayOfWeek + i) % 7] as string);
  };

  const months = (style: NameStyle = 'long'): string[] =>
    Array.from({ length: 12 }, (_, month) => intl({ month: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, month, 15, 12))));

  return { locale, timeZone, firstDayOfWeek, key, format, exact, relative, weekdays, months, intl: (options) => intl(options) };
}
