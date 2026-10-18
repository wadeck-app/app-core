import type { AbTest } from './AbSwitcher.js';
import { usePersistentChoice } from './usePersistentChoice.js';

// What the top of the left sidebar shows (A/B tested, dev server only). The module name always stays available to
// screen readers, whatever the mode.
export const SIDEBAR_HEADERS = {
  'icon-name': 'Icon + name',
  name: 'Name',
  icon: 'Icon',
  none: 'None',
} as const;
export type SidebarHeader = keyof typeof SIDEBAR_HEADERS;

export const SIDEBAR_HEADER_KEY = 'shell.sidebarHeader';

export const useSidebarHeader = (): [SidebarHeader, (h: SidebarHeader) => void] =>
  usePersistentChoice(SIDEBAR_HEADER_KEY, Object.keys(SIDEBAR_HEADERS) as SidebarHeader[], 'icon-name', 'sidebar header');

// Tooltip of each option: what it changes compared with the reference (Icon + name).
export const SIDEBAR_HEADER_HINTS: Record<SidebarHeader, string> = {
  'icon-name': 'Reference. The module logo and its name at the top of the sidebar.',
  name: 'The module name only, without its logo (the logo is already in the active top tab).',
  icon: 'The logo only; the name moves to a tooltip (and stays available to screen readers).',
  none: 'No header: the sidebar starts directly with the pages. The active top tab already names the module.',
};

export const sidebarHeaderTest = (value: SidebarHeader, onChange: (h: SidebarHeader) => void): AbTest => ({
  id: 'sidebarHeader',
  label: 'Sidebar header',
  summary: SIDEBAR_HEADERS[value],
  options: (Object.keys(SIDEBAR_HEADERS) as SidebarHeader[]).map((h) => ({ id: h, label: SIDEBAR_HEADERS[h], title: SIDEBAR_HEADER_HINTS[h] })),
  value,
  onSelect: (id) => onChange(id as SidebarHeader),
});
