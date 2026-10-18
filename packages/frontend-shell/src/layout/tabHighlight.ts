import type { AbTest } from './AbSwitcher.js';
import { usePersistentChoice } from './usePersistentChoice.js';

// How the active module is emphasized in the top tabs. Still being A/B tested (dev server only).
// The logo keeps one size in every style: emphasis never resizes it.
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
  contrast: 'Contrast',
  chip: 'Chip',
  ghost: 'Ghost',
  gradient: 'Gradient',
  topline: 'Topline',
  dot: 'Dot',
  // Variants of Gradient: same colors, one change each.
  gradientSoft: 'Grad soft',
  gradientFull: 'Grad full',
  gradientEdges: 'Grad edges',
  gradientEdgesInv: 'Edges inv',
  gradientFullDown: 'Full down',
  gradientFullUp: 'Full up',
  gradientFullEdges: 'Full edges',
  gradientUnder: 'Grad under',
  innerGlow: 'Inner glow',
  // Two-tone / multi-layer gradients, each with a different technique.
  sweep: 'Sweep',
  sweepSoft: 'Sweep soft',
  aurora: 'Aurora',
  underglow: 'Underglow',
  spotlight: 'Spotlight',
  mesh: 'Mesh',
  aura: 'Aura',
} as const;
export type TabHighlight = keyof typeof TAB_HIGHLIGHTS;

export const TAB_HIGHLIGHT_KEY = 'shell.tabHighlight';

export const useTabHighlight = (): [TabHighlight, (h: TabHighlight) => void] =>
  usePersistentChoice(TAB_HIGHLIGHT_KEY, Object.keys(TAB_HIGHLIGHTS) as TabHighlight[], 'current', 'tab highlight');

// Tooltip of each option: what it changes compared with the reference (Current).
export const TAB_HIGHLIGHT_HINTS: Record<TabHighlight, string> = {
  current: 'Reference. The active tab name takes the accent color; every logo looks the same.',
  pill: 'A tinted pill behind the active tab. The other logos turn grey.',
  solid: 'The active tab is a pill filled with the module color, white text. Its logo is inverted (white chip, colored letters); the others turn grey.',
  underline: 'A bar under the active tab. The other logos turn grey.',
  ring: 'A ring around the active logo. The other logos turn grey.',
  invert: 'The active logo swaps foreground and background: page-colored chip, colored letters and border. The other logos stay filled.',
  outline: 'Reverse of Invert: inactive logos are only outlined (colored letters and border), the active one is filled.',
  glow: 'A soft halo of the module color around the active logo.',
  expand: 'Only the active tab shows its name; the others are icon-only (name in their tooltip). Saves room when there are many modules.',
  lift: 'The active tab is raised on a neutral card with a thin accent border.',
  contrast: 'The whole active tab swaps foreground and background, in neutral colors: page text color as the fill, page background as the text. Its logo keeps the module color.',
  chip: 'The active tab becomes a rounded chip filled with the module color, in the shape of its logo: white name, translucent logo.',
  ghost: 'An outlined pill: 2px border and name in the module color, no fill.',
  gradient: 'A soft gradient fading out to the right from the module color, with a solid bar on the left edge.',
  topline: 'A bar above the active tab, instead of below as in Underline. The other logos turn grey.',
  dot: 'A small dot of the module color under the active tab. The other logos turn grey.',
  gradientSoft: 'Gradient without the solid bar on the left edge: only the soft fade from the module color.',
  gradientFull: 'Gradient filling the whole height of the top bar, from top to bottom, not just around the text.',
  gradientEdges: 'Gradient starting at both edges and meeting in the middle, where it is the lightest (Gradient is strongest on the left only).',
  gradientEdgesInv: 'Reverse of Grad edges: transparent at both edges, strongest in the middle.',
  gradientFullDown: 'Like Grad full, but the gradient runs top to bottom: strongest at the top of the bar, gone at the bottom.',
  gradientFullUp: 'Like Grad full, but bottom to top: strongest at the bottom of the bar, as if lit from the underline.',
  gradientFullEdges: 'Grad edges on the full height of the bar: the color starts at both edges and meets in the middle.',
  gradientUnder: 'The Gradient fade with a solid bar along the bottom edge instead of the left one.',
  innerGlow: 'No fill: a thin tinted edge and a soft glow that stays inside the pill.',
  sweep: 'A pill filled with a diagonal gradient from the module color to a darker shade of it, with a glossy highlight on top. White name, translucent logo.',
  sweepSoft: 'A calmer Sweep: the gradient starts at the right with the module color and runs left to a lighter tint of it (no dark end), with a lighter highlight.',
  aurora: 'A plain pill with a gradient border running from the module color to a second hue. Its logo becomes a two-tone gradient chip.',
  underglow: 'A two-tone gradient bar under the active tab, with a soft glow of the module color around it.',
  spotlight: 'A radial light cone in the module color falling from the top edge of the active tab.',
  mesh: 'A mesh gradient: two soft blobs (module color top-left, second hue bottom-right) on the surface, with a thin tinted border. Two-tone logo.',
  aura: 'No pill: the active name itself is painted with the two-tone gradient, and its logo is a two-tone gradient chip.',
};

export const tabHighlightTest = (value: TabHighlight, onChange: (h: TabHighlight) => void): AbTest => ({
  id: 'tabStyle',
  label: 'Active tab',
  summary: TAB_HIGHLIGHTS[value],
  options: (Object.keys(TAB_HIGHLIGHTS) as TabHighlight[]).map((h) => ({ id: h, label: TAB_HIGHLIGHTS[h], title: TAB_HIGHLIGHT_HINTS[h] })),
  value,
  onSelect: (id) => onChange(id as TabHighlight),
});
