import { useEffect } from 'react';
import { applyPalettes, usePalette } from './palettes.js';

// Puts the stored palettes (dark and light) on <html> when the app starts and when a stored one changes, whatever page or top bar is shown.
export function PaletteApplier(): null {
  const [dark] = usePalette('dark');
  const [light] = usePalette('light');
  useEffect(() => {
    applyPalettes();
  }, [dark, light]);
  return null;
}
