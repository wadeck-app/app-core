import { useEffect } from 'react';
import { useAbTest } from '@wadeck-app/dsl-ui';
import { useDockTests } from './useDockTests.js';

// The dark palettes under test; the CSS of each is in palettes.css. 'current' is the dsl-ui theme as it is.
export const PALETTE_IDS = ['graphite', 'night', 'ink', 'warm', 'teal'] as const;

// A/B test of the dark palette, applied to the whole app through <html data-palette>: every real page follows it.
// Once one is chosen, bake its values into the theme and delete this file, palettes.css and the <PaletteAbTest /> in App.tsx.
export function PaletteAbTest(): null {
  const tab = useAbTest({
    id: 'palette',
    label: 'Palette',
    initial: 'current',
    options: {
      current: { label: 'Current', hint: 'The theme as it is: near-black page, lighter blue-gray cards and menus.' },
      graphite: { label: 'Graphite', hint: 'Neutral gray, no tint. Page and cards close together; menus darkest.' },
      night: { label: 'Night', hint: 'Deep blue like today but lifted and softer. Page and cards close together; menus darkest.' },
      ink: { label: 'Ink', hint: 'The current black becomes the menus; the page takes the slate that was the cards.' },
      warm: { label: 'Warm', hint: 'Brown-gray with a warmer text. Page and cards close together; menus darkest.' },
      teal: { label: 'Teal', hint: 'Blue-green gray. Page and cards close together; menus darkest.' },
    },
  });
  useDockTests([tab]);
  useEffect(() => {
    const root = document.documentElement;
    if (tab.value === 'current') {
      root.removeAttribute('data-palette');
    } else {
      root.setAttribute('data-palette', tab.value);
    }
    return () => root.removeAttribute('data-palette');
  }, [tab.value]);
  return null;
}
