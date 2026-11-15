import React from 'react';
import { Moon, Palette, Sun } from 'lucide-react';
import { IconButton, Popover, useAbTest, useTheme } from '@wadeck-app/dsl-ui';
import { useDockTests } from '../useDockTests.js';
import { PaletteList } from './PaletteList.js';

// The theme controls of the top bar. A/B test "Theme control" (dock): once decided, keep one variant and delete the other and the test.
//  - beside: the one-click dark/light button as it always was, and a palette button next to it.
//  - merged: one button; its popover holds the mode (light/dark) and the palettes.
export function ThemeControls(): React.ReactElement {
  const { theme, setTheme } = useTheme();
  const dark = theme === 'dark';
  const variant = useAbTest({
    id: 'theme-control',
    label: 'Theme control',
    initial: 'beside',
    options: {
      beside: { label: 'Beside', hint: 'The dark/light button stays a one-click toggle; a palette button sits next to it.' },
      merged: { label: 'Merged', hint: 'One button; its popover holds light/dark and the palettes.' },
    },
  });
  useDockTests([variant]);

  if (variant.value === 'merged') {
    return (
      <Popover
        side="bottom"
        align="end"
        trigger={<IconButton icon={dark ? <Moon size={14} /> : <Sun size={14} />} aria-label="Theme" variant="ghost" size="icon-sm" />}
      >
        <div className="min-w-60 text-sm">
          <h3 className="mb-1 px-2 font-semibold text-content">Mode</h3>
          <div role="radiogroup" aria-label="Mode" className="mb-3 grid grid-cols-2 gap-1">
            {(['light', 'dark'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={theme === mode}
                onClick={() => setTheme(mode)}
                className={`flex items-center justify-center gap-2 rounded-md border border-border px-2 py-1.5 hover:bg-muted-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${theme === mode ? 'bg-muted-bg font-semibold text-content' : 'text-muted'}`}
              >
                {mode === 'light' ? <Sun size={14} /> : <Moon size={14} />}
                {mode === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
          <h3 className="mb-1 px-2 font-semibold text-content">Dark palette</h3>
          <PaletteList dark={dark} />
        </div>
      </Popover>
    );
  }

  return (
    <>
      <Popover side="bottom" align="end" trigger={<IconButton icon={<Palette size={14} />} aria-label="Dark palette" variant="ghost" size="icon-sm" />}>
        <div className="min-w-60 text-sm">
          <h3 className="mb-1 px-2 font-semibold text-content">Dark palette</h3>
          <PaletteList dark={dark} />
        </div>
      </Popover>
      <IconButton
        icon={dark ? <Sun size={14} /> : <Moon size={14} />}
        aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        onClick={() => setTheme(dark ? 'light' : 'dark')}
        variant="ghost"
        size="icon-sm"
      />
    </>
  );
}
