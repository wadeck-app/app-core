import type { Config } from 'tailwindcss';
// @ts-expect-error - plain JS preset shipped by dsl-ui, no type declarations
import dslUiPreset, { dslUiContent } from '@wadeck-app/dsl-ui/tailwind-preset';

// The preset owns the generic colour mapping (primary, bg, surface, border,
// content, muted, success, danger, warning, ...) and the dark-mode selector.
export default {
  presets: [dslUiPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    // Required, not optional: Tailwind reads `content` from the top-level
    // config only, so the preset cannot contribute scan paths itself. Without
    // this the build still succeeds and every dsl-ui component renders
    // unstyled -- exactly the bug this file fixes.
    ...(dslUiContent as string[]),
  ],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
