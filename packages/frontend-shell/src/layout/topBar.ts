import type { AbTest } from './AbSwitcher.js';
import { usePersistentChoice } from './usePersistentChoice.js';

// Height and style of the top bar (A/B tested, dev server only). Heights include the 1px bottom border when there is one.
export const TOP_BARS = {
  current: 'Current',
  cozy: 'Cozy',
  compact: 'Compact',
  slim: 'Slim',
  dense: 'Dense',
  flat: 'Compact flat',
  blend: 'Compact blend',
} as const;
export type TopBar = keyof typeof TOP_BARS;

export const TOP_BAR_KEY = 'shell.topBar';

export const useTopBar = (): [TopBar, (t: TopBar) => void] =>
  usePersistentChoice(TOP_BAR_KEY, Object.keys(TOP_BARS) as TopBar[], 'current', 'top bar');

const BORDERED = 'border-b border-border bg-surface';

// `relative z-10` keeps a shadow visible above the content below the bar.
export const TOP_BAR_CLASS: Record<TopBar, { header: string; brand: string }> = {
  current: { header: `relative z-10 h-[61px] ${BORDERED}`, brand: 'text-base' },
  cozy: { header: `relative z-10 h-[53px] ${BORDERED}`, brand: 'text-base' },
  compact: { header: `relative z-10 h-[45px] ${BORDERED}`, brand: 'text-base' },
  slim: { header: `relative z-10 h-[41px] ${BORDERED}`, brand: 'text-sm' },
  dense: { header: `relative z-10 h-[37px] ${BORDERED}`, brand: 'text-sm' },
  flat: { header: 'relative z-10 h-11 bg-surface shadow-sm', brand: 'text-base' },
  blend: { header: 'relative z-10 h-11 bg-bg', brand: 'text-base' },
};

// Tooltip of each option: what it changes compared with the reference (Current).
export const TOP_BAR_HINTS: Record<TopBar, string> = {
  current: 'Reference. 61px tall (60px + the bottom border).',
  cozy: '53px tall: a little less air above and below the tabs.',
  compact: '45px tall: the usual height of a dense app header.',
  slim: '41px tall, with a smaller app name.',
  dense: '37px tall, with a smaller app name: the tightest the tab styles allow (Dot fills it exactly).',
  flat: '44px tall, no bottom border: a soft shadow separates it from the page instead.',
  blend: '44px tall, no border and the page background: the bar melts into the page, only the sidebar edge marks it.',
};

export const topBarTest = (value: TopBar, onChange: (t: TopBar) => void): AbTest => ({
  id: 'topBar',
  label: 'Top bar',
  summary: TOP_BARS[value],
  options: (Object.keys(TOP_BARS) as TopBar[]).map((t) => ({ id: t, label: TOP_BARS[t], title: TOP_BAR_HINTS[t] })),
  value,
  onSelect: (id) => onChange(id as TopBar),
});
