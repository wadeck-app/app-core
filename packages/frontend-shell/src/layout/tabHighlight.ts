import { usePersistentChoice } from './usePersistentChoice.js';

// How the active module is emphasized in the top tabs (A/B tested on top of the D6/D7 logos).
export const TAB_HIGHLIGHTS = {
  current: 'Current',
  pill: 'Pill',
  solid: 'Solid',
  underline: 'Underline',
  ring: 'Ring',
  // Foreground/background of the active icon exchanged.
  invert: 'Invert',
  // Inactive icons outlined, the active one filled.
  outline: 'Outline',
  glow: 'Glow',
  // Only the active tab shows its name, the others are icon-only.
  expand: 'Expand',
  lift: 'Lift',
} as const;
export type TabHighlight = keyof typeof TAB_HIGHLIGHTS;

export const TAB_HIGHLIGHT_KEY = 'shell.tabHighlight';

export const useTabHighlight = (): [TabHighlight, (h: TabHighlight) => void] =>
  usePersistentChoice(TAB_HIGHLIGHT_KEY, Object.keys(TAB_HIGHLIGHTS) as TabHighlight[], 'current', 'tab highlight');

// Tooltip of each option: what it changes compared with the reference (Current).
export const TAB_HIGHLIGHT_HINTS: Record<TabHighlight, string> = {
  current: 'Reference. The active tab name takes the accent color; every logo looks the same.',
  pill: 'A tinted pill behind the active tab. Its logo grows, the other logos turn grey.',
  solid: 'The active tab is a pill filled with the module color, white text. Its logo is inverted (white chip, colored letters); the others turn grey.',
  underline: 'A bar under the active tab. The other logos turn grey.',
  ring: 'A ring around the active logo, which also grows. The other logos turn grey.',
  invert: 'The active logo swaps foreground and background: page-colored chip, colored letters and border. The other logos stay filled.',
  outline: 'Reverse of Invert: inactive logos are only outlined (colored letters and border), the active one is filled.',
  glow: 'A soft halo of the module color around the active logo, which also grows.',
  expand: 'Only the active tab shows its name; the others are icon-only (name in their tooltip). Saves room when there are many modules.',
  lift: 'The active tab is raised on a neutral card with a thin accent border.',
};
