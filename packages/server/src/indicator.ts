// What sits next to a menu entry or a tab: a number, an icon in place of it, a tone (color) for either. Pure: the manifest schema, the
// SDK (a page component that sets an indicator) and the shell (which reads and draws it, with its own copy of these lists, kept in
// step by a test) share the words.

export const INDICATOR_TONES = ['neutral', 'info', 'success', 'warning', 'danger'] as const;
export const INDICATOR_ICONS = ['info', 'success', 'warning', 'error'] as const;

export type IndicatorTone = (typeof INDICATOR_TONES)[number];
export type IndicatorIcon = (typeof INDICATOR_ICONS)[number];

export interface Indicator {
  // A whole number of 0 or more.
  count?: number;
  // The color of the number, or of the icon (default of an icon: from the icon).
  tone?: IndicatorTone;
  // Replaces the number.
  icon?: IndicatorIcon;
  // The text of the icon or of the number for assistive technology and the tooltip ("3 failures").
  label?: string;
}

// A page component sets the indicator of an entry (its id: `<moduleId><path>`) with a window event, because the bundle of a module
// and the shell do not share the code of app-core, only react, the router and dsl. The last state of every entry is also kept in a
// map on globalThis, for a shell that starts listening after a component already set one.
export const ENTRY_INDICATOR_EVENT = 'app-core:entry-indicator';
export const ENTRY_INDICATORS_STORE = '__appCoreEntryIndicators';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const KEYS = new Set(['count', 'tone', 'icon', 'label']);

// A value given by a module (a route's answer, a component): the indicator it means, or what is wrong with it. Never guesses: an unknown
// tone or icon, a count that is not a whole number, an unknown key are problems, not defaults.
export function parseIndicator(raw: unknown): { indicator: Indicator } | { problem: string } {
  if (!isRecord(raw)) {
    return { problem: `an indicator is an object like {"count": 3, "tone": "warning"}, got ${JSON.stringify(raw)}` };
  }
  const object = raw;
  const unknown = Object.keys(object).filter((key) => !KEYS.has(key));
  if (unknown.length > 0) {
    return { problem: `unknown key ${unknown.map((k) => `"${k}"`).join(', ')} (an indicator has count, tone, icon, label)` };
  }
  const { count, tone, icon, label } = object;
  if (count !== undefined && (typeof count !== 'number' || !Number.isInteger(count) || count < 0)) {
    return { problem: `"count" is ${JSON.stringify(count)}, not a whole number of 0 or more` };
  }
  if (tone !== undefined && !(INDICATOR_TONES as readonly unknown[]).includes(tone)) {
    return { problem: `"tone" is ${JSON.stringify(tone)}; it is one of ${INDICATOR_TONES.join(', ')}` };
  }
  if (icon !== undefined && !(INDICATOR_ICONS as readonly unknown[]).includes(icon)) {
    return { problem: `"icon" is ${JSON.stringify(icon)}; it is one of ${INDICATOR_ICONS.join(', ')}` };
  }
  if (label !== undefined && (typeof label !== 'string' || label.trim() === '')) {
    return { problem: `"label" is ${JSON.stringify(label)}, not a non-empty text` };
  }
  if (count === undefined && icon === undefined) {
    return { problem: 'an indicator needs a "count" or an "icon": there is nothing to show' };
  }
  return { indicator: { ...(count === undefined ? {} : { count: count as number }), ...(tone === undefined ? {} : { tone: tone as IndicatorTone }), ...(icon === undefined ? {} : { icon: icon as IndicatorIcon }), ...(label === undefined ? {} : { label: label as string }) } };
}
