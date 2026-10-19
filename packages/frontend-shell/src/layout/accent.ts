// The accent family of dsl-ui's theme (theme.css defines them per theme: `:root` for light, `.dark` for dark).
export const ACCENT_VARIABLES = ['--color-primary', '--color-primary-solid', '--color-primary-solid-hover', '--color-primary-light'] as const;
export type AccentVariable = (typeof ACCENT_VARIABLES)[number];
export type AccentVariables = Record<AccentVariable, string>;

// The accent variables derived from ONE color (`solid`, the fill of a primary button). Pure: no DOM, no state.
//
// It overrides only the accent family, never backgrounds or text colors. Light and dark values live in the same
// declaration through `light-dark()`, which picks by the `color-scheme` that dsl-ui's theme already sets per theme
// (`color-scheme: light` on `:root`, `dark` on `.dark`), so the result follows the theme with no theme-specific rule,
// no stylesheet-order or specificity concern, and can sit on any element (`AccentScope`) or on the root.
//
// Needs `light-dark()` and `color-mix()` (Chrome 123+, Safari 17.5+, Firefox 120+).
export function accentVariables(solid: string): AccentVariables {
  const mix = (pct: number, other: string): string => `color-mix(in srgb, ${solid} ${pct}%, ${other})`;
  const lightDark = (light: string, dark: string): string => `light-dark(${light}, ${dark})`;
  return {
    // Text and icons in the accent: the color itself on light, a lighter tint on dark for contrast.
    '--color-primary': lightDark(solid, mix(60, 'white')),
    '--color-primary-solid': solid,
    '--color-primary-solid-hover': mix(85, 'black'),
    // Tinted background: almost white on light, a deep tint on dark.
    '--color-primary-light': lightDark(mix(10, 'white'), mix(28, '#0b1120')),
  };
}
