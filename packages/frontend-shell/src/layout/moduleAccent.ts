import { useEffect } from 'react';

const STYLE_ATTR = 'data-module-accent';

// Overrides only the accent family of dsl-ui's theme (--color-primary*), never backgrounds or text colors.
// dsl-ui defines these per theme (:root / .dark), so the override carries one rule per theme, derived from a single
// color. `html:root` / `html.dark` outrank dsl-ui's bare `:root` / `.dark`, whatever the stylesheet order.
export function accentCss(solid: string): string {
  const mix = (pct: number, other: string): string => `color-mix(in srgb, ${solid} ${pct}%, ${other})`;
  return `
html:root, html[data-theme='light'] {
  --color-primary: ${solid};
  --color-primary-solid: ${solid};
  --color-primary-solid-hover: ${mix(85, 'black')};
  --color-primary-light: ${mix(10, 'white')};
}
html.dark, html[data-theme='dark'] {
  --color-primary: ${mix(60, 'white')};
  --color-primary-solid: ${solid};
  --color-primary-solid-hover: ${mix(85, 'black')};
  --color-primary-light: ${mix(28, '#0b1120')};
}`;
}

// Applies `solid` as the app accent while mounted; `undefined` restores dsl-ui's default accent.
export function useModuleAccent(solid: string | undefined): void {
  useEffect(() => {
    if (solid === undefined) return;
    const style = document.createElement('style');
    style.setAttribute(STYLE_ATTR, solid);
    style.textContent = accentCss(solid);
    document.head.appendChild(style);
    return () => style.remove();
  }, [solid]);
}
