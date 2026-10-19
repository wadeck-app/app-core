import React from 'react';
import { accentVariables } from './accent.js';

// Recolors the accent of everything inside it with `color`; `undefined` keeps the theme's own accent.
// It is a plain wrapper (`display: contents`, so it takes no part in the layout), so scopes nest and need no effect:
// the cascade does the work. The wrapper is always rendered, so switching `color` never remounts the children.
// Limit: what React renders in a portal (popovers, dialogs, toasts) lives outside the subtree and keeps the theme's accent.
export function AccentScope({ color, children }: { color: string | undefined; children: React.ReactNode }): React.ReactElement {
  return (
    <div data-accent-scope={color} className="contents" style={color === undefined ? undefined : (accentVariables(color) as React.CSSProperties)}>
      {children}
    </div>
  );
}
