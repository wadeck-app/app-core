import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { IconButton, Popover, useTheme } from '@wadeck-app/dsl-ui';
import { PaletteList } from './PaletteList.js';

// The theme control of the top bar: one button (the icon of the mode that is on); its popover holds the mode (light/dark) and the
// palettes of that mode.
export function ThemeControls(): React.ReactElement {
  const { theme, setTheme } = useTheme();
  const dark = theme === 'dark';
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
        <h3 className="mb-1 px-2 font-semibold text-content">{dark ? 'Dark palette' : 'Light palette'}</h3>
        <PaletteList mode={dark ? 'dark' : 'light'} />
      </div>
    </Popover>
  );
}
