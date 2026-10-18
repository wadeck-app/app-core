import React, { useState } from 'react';
import { Link } from 'react-router-dom';

// A/B test of the shell navigation, dev server only (App renders it under import.meta.env.DEV).
export const LAYOUT_VARIANTS = {
  classic: 'Classic - current flat top bar',
  a: 'A - top tabs + fixed sidebar',
  b: 'B - Linear-like sidebar tree',
  c: 'C - top tabs + collapsible rail',
  // Short on purpose: the description floats outside the fixed-width panel and must fit the viewport.
  d: 'D - sidebar always visible',
  d1: 'D1 - dense, accent bar',
  d2: 'D2 - pills + 1-letter logo',
  d3: 'D3 - dark + 1-letter logo',
  d4: 'D4 - pills + 2-letter logo',
  d5: 'D5 - dark + 2-letter logo',
  d6: 'D6 - pills + colored logos',
  d7: 'D7 - dark + colored logos',
} as const;
export type LayoutVariant = keyof typeof LAYOUT_VARIANTS;

export const LAYOUT_VARIANT_KEY = 'shell.layout';

const isLayoutVariant = (v: string | null): v is LayoutVariant => v !== null && v in LAYOUT_VARIANTS;

export function useLayoutVariant(): [LayoutVariant, (v: LayoutVariant) => void] {
  const [variant, setVariant] = useState<LayoutVariant>(() => {
    const stored = localStorage.getItem(LAYOUT_VARIANT_KEY);
    if (stored === null) return 'classic';
    if (isLayoutVariant(stored)) return stored;
    console.warn(`[layout] Ignoring unknown layout "${stored}" in localStorage "${LAYOUT_VARIANT_KEY}"; expected one of: ${Object.keys(LAYOUT_VARIANTS).join(', ')}.`);
    return 'classic';
  });
  const choose = (v: LayoutVariant): void => {
    localStorage.setItem(LAYOUT_VARIANT_KEY, v);
    setVariant(v);
  };
  return [variant, choose];
}

interface LayoutSwitcherProps {
  variant: LayoutVariant;
  // Buttons by default (state switch); with `hrefFor`, links (route-based switch, dev comparison page).
  onChange?: (v: LayoutVariant) => void;
  hrefFor?: (v: LayoutVariant) => string;
  variants?: readonly LayoutVariant[];
  // Left-side toggle for the per-module accent color; omitted = no toggle.
  accent?: { on: boolean; onToggle: () => void };
}

// Floating on purpose: switching variants must be one obvious click, on the real page.
// The panel has a fixed position and a fixed width (equal-width cells, nothing in it depends on the active variant),
// so the buttons never move. The description sits outside it, stuck to its right edge and free to grow to the right.
export function LayoutSwitcher({ variant, onChange, hrefFor, variants = Object.keys(LAYOUT_VARIANTS) as LayoutVariant[], accent }: LayoutSwitcherProps): React.ReactElement {
  const cell = (v: LayoutVariant): string =>
    `rounded-full py-1.5 text-center font-semibold transition-colors ${v === variant ? 'bg-primary-solid text-white' : 'text-muted hover:bg-bg hover:text-content'}`;
  const label = (v: LayoutVariant): string => (v === 'classic' ? 'Classic' : v.toUpperCase());
  return (
    // z-[9999]: stays above every overlay, modal and sticky element of the page.
    <div className="fixed bottom-6 left-1/2 z-[9999] -translate-x-1/2">
      <div
        role={hrefFor ? 'navigation' : 'group'}
        aria-label="Layout variants"
        style={{ gridTemplateColumns: `repeat(${variants.length}, minmax(0, 1fr))` }}
        className="grid w-[46rem] gap-1 rounded-full border border-border bg-surface p-1.5 text-sm shadow-xl"
      >
        {variants.map((v) =>
          hrefFor ? (
            <Link key={v} to={hrefFor(v)} aria-current={v === variant ? 'true' : undefined} title={LAYOUT_VARIANTS[v]} className={cell(v)}>
              {label(v)}
            </Link>
          ) : (
            <button key={v} type="button" onClick={() => onChange?.(v)} aria-pressed={v === variant} title={LAYOUT_VARIANTS[v]} className={cell(v)}>
              {label(v)}
            </button>
          ),
        )}
      </div>
      {accent ? (
        <button
          type="button"
          onClick={accent.onToggle}
          aria-pressed={accent.on}
          title="Recolor the accent (primary) with the active module's color; backgrounds and text are untouched"
          className="absolute right-full top-1/2 mr-3 -translate-y-1/2 whitespace-nowrap rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-content shadow-xl"
        >
          Module accent: {accent.on ? 'on' : 'off'}
        </button>
      ) : null}
      <span
        data-testid="layout-description"
        className="absolute left-full top-1/2 ml-3 -translate-y-1/2 whitespace-nowrap rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted shadow-xl"
      >
        {LAYOUT_VARIANTS[variant]}
      </span>
    </div>
  );
}
