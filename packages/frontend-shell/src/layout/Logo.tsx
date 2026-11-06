import React from 'react';
import { InitialsTile, colorFromId, initialsOf } from '@wadeck-app/dsl-ui';

// Tailwind 600 shades: each keeps white text readable (contrast >= 3.5) on its own.
const MODULE_PALETTE = ['#e11d48', '#ea580c', '#d97706', '#059669', '#0d9488', '#0284c7', '#4f46e5', '#7c3aed', '#c026d3'] as const;

// Stable per module id: the same module keeps its color across reloads, in its logo and as the app accent.
export const moduleColor = (id: string): string => colorFromId(id, MODULE_PALETTE);

// The logo of a module: the initials of its title on the color of its id. A tile is as wide as its letters ("Q" is narrower than
// "MO"), so every tile is stretched to the box of one width: tiles and the labels next to them line up whatever the letters.
export function Logo({ title, moduleId }: { title: string; moduleId: string }): React.ReactElement {
  return (
    <span data-logo-box className="inline-flex w-7 shrink-0 justify-start [&>span]:w-full">
      <InitialsTile text={initialsOf(title)} color={moduleColor(moduleId)} />
    </span>
  );
}
