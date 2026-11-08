// What sits next to a menu entry or a tab: a number, an icon in place of it, a tone (color) for either. The lists and the checks are the
// ones of packages/server/src/indicator.ts (the manifest schema and the SDK use that file); a test keeps the two in step.

export const INDICATOR_TONES = ['neutral', 'info', 'success', 'warning', 'danger'] as const;
export const INDICATOR_ICONS = ['info', 'success', 'warning', 'error'] as const;

export type IndicatorTone = (typeof INDICATOR_TONES)[number];
export type IndicatorIcon = (typeof INDICATOR_ICONS)[number];

export interface Indicator {
  count?: number;
  tone?: IndicatorTone;
  icon?: IndicatorIcon;
  label?: string;
}

export const ENTRY_INDICATOR_EVENT = 'app-core:entry-indicator';
export const ENTRY_INDICATORS_STORE = '__appCoreEntryIndicators';

// What the icon says when the module gave no label.
export const DEFAULT_ICON_LABEL: Record<IndicatorIcon, string> = { info: 'Information', success: 'OK', warning: 'Warning', error: 'Error' };

// The tone an icon has when none is given.
export const DEFAULT_ICON_TONE: Record<IndicatorIcon, IndicatorTone> = { info: 'info', success: 'success', warning: 'warning', error: 'danger' };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const KEYS = new Set(['count', 'tone', 'icon', 'label']);

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

// The indicator in the answer of a route: the answer itself, or what is at `field` ("total", "counts.open"). A number is a count; an
// object is an indicator; what the manifest gave as defaults (tone, icon, label) fills what the answer does not say.
export function readIndicator(answer: unknown, field: string | undefined, defaults: Indicator): { indicator: Indicator } | { problem: string } {
  let value: unknown = answer;
  for (const name of field === undefined ? [] : field.split('.')) {
    if (!isRecord(value) || !(name in value)) {
      return { problem: `the answer has no "${field}" (it stopped at "${name}")` };
    }
    value = value[name];
  }
  const given = typeof value === 'number' ? { count: value } : value;
  if (!isRecord(given)) {
    return { problem: `${field === undefined ? 'the answer' : `"${field}"`} is ${JSON.stringify(value)}, not a whole number of 0 or more nor an indicator object` };
  }
  return parseIndicator({ ...defaults, ...given });
}

// The text of an indicator for assistive technology and the tooltip: "Warning", "3 failures", "3".
export function describeIndicator(indicator: Indicator): string | undefined {
  const base = indicator.label ?? (indicator.icon === undefined ? undefined : DEFAULT_ICON_LABEL[indicator.icon]);
  if (indicator.icon === undefined) {
    return indicator.label === undefined ? (indicator.count === undefined ? undefined : String(indicator.count)) : `${indicator.count ?? ''} ${indicator.label}`.trim();
  }
  return indicator.count === undefined ? base : `${base} (${indicator.count})`;
}
