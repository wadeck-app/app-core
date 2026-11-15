import React from 'react';
import { PALETTES, usePalette } from './palettes.js';

// The palettes as a list of radios, each with a swatch of its three layers (menu bar on top, page, card on the page). Palettes are for the dark mode.
export function PaletteList({ dark }: { dark: boolean }): React.ReactElement {
  const [current, choose] = usePalette();
  return (
    <div>
      <div role="radiogroup" aria-label="Dark palette" className="flex flex-col gap-0.5">
        {PALETTES.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={p.id === current}
            title={p.hint}
            onClick={() => choose(p.id)}
            className={`flex items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${p.id === current ? 'bg-muted-bg font-semibold text-content' : 'text-muted'}`}
          >
            <span aria-hidden="true" className="flex h-8 w-14 shrink-0 flex-col overflow-hidden rounded ring-1 ring-muted">
              <span className="h-2" style={{ backgroundColor: p.chrome }} />
              <span className="flex flex-1 items-center justify-center" style={{ backgroundColor: p.bg }}>
                <span className="h-3 w-9 rounded-sm" style={{ backgroundColor: p.surface }} />
              </span>
            </span>
            <span className="flex-1">{p.label}</span>
            <span aria-hidden="true" className="w-3 text-primary">{p.id === current ? '✓' : ''}</span>
          </button>
        ))}
      </div>
      {dark ? null : <p className="mt-2 px-2 text-xs text-muted">Palettes are for the dark mode only: the light mode is not changed.</p>}
    </div>
  );
}
