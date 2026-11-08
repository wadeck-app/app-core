import React from 'react';
import { CircleCheck, CircleX, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import { DEFAULT_ICON_TONE, describeIndicator, type Indicator, type IndicatorIcon, type IndicatorTone } from './indicator.js';

const ICONS: Record<IndicatorIcon, LucideIcon> = { info: Info, success: CircleCheck, warning: TriangleAlert, error: CircleX };

// Semantic tokens only (they follow the theme, light and dark): no color of its own. `neutral` is the plain pill; on the current entry
// it is the same pill on the surface, with a hairline, because the accent belongs to the bar of the rail look.
const PILL: Record<IndicatorTone, string> = {
  neutral: 'bg-muted-bg text-muted',
  info: 'bg-info-bg text-info-text',
  success: 'bg-success-bg text-success-text',
  warning: 'bg-warning-bg text-warning-text',
  danger: 'bg-danger-bg text-danger-text',
};
const PILL_NEUTRAL_CURRENT = 'bg-surface text-content ring-1 ring-inset ring-border';
const ICON_COLOR: Record<IndicatorTone, string> = {
  neutral: 'text-muted',
  info: 'text-info-text',
  success: 'text-success-text',
  warning: 'text-warning-text',
  danger: 'text-danger',
};

// The indicator of an entry: an icon (in place of the number) or a number in a pill, in a tone. Read aloud after the label:
// "Alerts, 3" or "Alerts, Warning".
// The tooltip is always there: the label of the module when it gave one ("3 failures"), else the name of the entry and the figure
// ("Executions: 3"), so a bare number never has to be guessed.
export function IndicatorBadge({ indicator, current = false, name }: { indicator: Indicator | undefined; current?: boolean; name?: string }): React.ReactElement | null {
  if (indicator === undefined) {
    return null;
  }
  const described = describeIndicator(indicator);
  const text = indicator.label === undefined && indicator.icon === undefined && name !== undefined ? `${name}: ${described}` : described;
  if (indicator.icon !== undefined) {
    const Icon = ICONS[indicator.icon];
    const tone = indicator.tone ?? DEFAULT_ICON_TONE[indicator.icon];
    return (
      <span className={`ml-1.5 inline-flex ${ICON_COLOR[tone]}`} title={text}>
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">, {text}</span>
      </span>
    );
  }
  const tone = indicator.tone ?? 'neutral';
  return (
    <span className={`ml-1.5 rounded-full px-1.5 text-xs ${tone === 'neutral' && current ? PILL_NEUTRAL_CURRENT : PILL[tone]}`} title={text}>
      <span className="sr-only">, {indicator.label === undefined ? '' : `${indicator.label} `}</span>
      {indicator.count}
    </span>
  );
}
