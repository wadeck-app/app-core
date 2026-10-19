import { useEffect } from 'react';
import { ACCENT_VARIABLES, accentVariables } from './accent.js';

// Recolors the accent of the WHOLE document, portals included, while mounted; `undefined` keeps the theme's accent.
// Prefer `AccentScope` for a subtree. This is for an app whose popovers, dialogs and toasts (rendered in portals,
// outside any subtree) must follow the accent too. Sets inline custom properties on <html> and removes them on cleanup.
export function useRootAccent(solid: string | undefined): void {
  useEffect(() => {
    if (solid === undefined) return;
    const root = document.documentElement;
    for (const [name, value] of Object.entries(accentVariables(solid))) root.style.setProperty(name, value);
    return () => {
      for (const name of ACCENT_VARIABLES) root.style.removeProperty(name);
    };
  }, [solid]);
}
