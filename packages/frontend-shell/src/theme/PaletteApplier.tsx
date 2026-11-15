import { useEffect } from 'react';
import { applyPalette, usePalette } from './palettes.js';

// Puts the stored palette on <html> when the app starts (and when the stored one changes), whatever page or top bar is shown.
export function PaletteApplier(): null {
  const [palette] = usePalette();
  useEffect(() => {
    applyPalette(palette);
  }, [palette]);
  return null;
}
