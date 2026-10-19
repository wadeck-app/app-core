import React from 'react';
import { InitialsTile } from './InitialsTile.js';
import { colorFromId, initialsOf } from './initials.js';

// Tailwind 600 shades: each keeps white text readable (contrast >= 3.5) on its own.
const MODULE_PALETTE = ['#e11d48', '#ea580c', '#d97706', '#059669', '#0d9488', '#0284c7', '#4f46e5', '#7c3aed', '#c026d3'] as const;

// Stable per module id: the same module keeps its color across reloads, in its logo and as the app accent.
export const moduleColor = (id: string): string => colorFromId(id, MODULE_PALETTE);

// The logo of a module: the initials of its title on the color of its id.
export function Logo({ title, moduleId }: { title: string; moduleId: string }): React.ReactElement {
  return <InitialsTile text={initialsOf(title)} color={moduleColor(moduleId)} />;
}
