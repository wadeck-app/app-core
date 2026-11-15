import { useSyncExternalStore } from 'react';

export const DEFAULT_PALETTE = 'default';
export const PALETTE_STORAGE_KEY = 'app-core.theme.palette';

export interface Palette {
  id: string;
  label: string;
  // Tooltip: what it looks like.
  hint: string;
  // The three layers shown as the swatch of the picker, the same values as the css block of palettes.css (a test keeps them equal).
  chrome: string;
  bg: string;
  surface: string;
}

// The dark palettes: the picker lists them in this order, palettes.css has one block per id but the default one (the dsl-ui theme as it is).
export const PALETTES: readonly Palette[] = [
  { id: DEFAULT_PALETTE, label: 'Default', hint: 'The theme as it is: near-black page, lighter blue-gray cards and menus.', chrome: '#1e293b', bg: '#020617', surface: '#1e293b' },
  { id: 'graphite', label: 'Graphite', hint: 'Neutral gray, no tint. Page and cards close together; menus darkest.', chrome: '#0b0c0e', bg: '#16171a', surface: '#1c1e22' },
  { id: 'night', label: 'Night', hint: 'Deep blue like the default but lifted and softer. Menus darkest.', chrome: '#060a13', bg: '#0e1422', surface: '#131a2b' },
  { id: 'warm', label: 'Warm', hint: 'Brown-gray with a warmer text. Menus darkest.', chrome: '#0c0a09', bg: '#181614', surface: '#1e1c19' },
  { id: 'dusk', label: 'Dusk', hint: 'Lighter blue-gray, the least contrast of all: nothing is near-black.', chrome: '#13161c', bg: '#1c2029', surface: '#232834' },
  { id: 'plum', label: 'Plum', hint: 'Purple-gray. Menus darkest.', chrome: '#0e0c12', bg: '#17141c', surface: '#1d1a24' },
  { id: 'wine', label: 'Wine', hint: 'Red-brown gray. Menus darkest.', chrome: '#0f0b0d', bg: '#1a1417', surface: '#211a1e' },
  { id: 'olive', label: 'Olive', hint: 'Yellow-green gray. Menus darkest.', chrome: '#0d0f0a', bg: '#171a14', surface: '#1d2018' },
];

const known = (id: string): boolean => PALETTES.some((p) => p.id === id);
const listeners = new Set<() => void>();
const warned = new Set<string>();

// The stored palette. A value that is not a palette is said once, with the known ids, and the default applies: never used silently.
export function readPalette(): string {
  const stored = localStorage.getItem(PALETTE_STORAGE_KEY);
  if (stored === null || stored === DEFAULT_PALETTE) {
    return DEFAULT_PALETTE;
  }
  if (known(stored)) {
    return stored;
  }
  if (!warned.has(stored)) {
    warned.add(stored);
    console.warn(`[theme] Ignoring unknown palette "${stored}" in localStorage "${PALETTE_STORAGE_KEY}"; expected one of: ${PALETTES.map((p) => p.id).join(', ')}. The default palette is used.`);
  }
  return DEFAULT_PALETTE;
}

// <html data-palette="...">: palettes.css reads it (dark theme only). The default palette sets nothing.
export function applyPalette(id: string): void {
  const root = document.documentElement;
  if (id === DEFAULT_PALETTE) {
    root.removeAttribute('data-palette');
  } else {
    root.setAttribute('data-palette', id);
  }
}

export function writePalette(id: string): void {
  if (!known(id)) {
    throw new Error(`Unknown palette "${id}"; expected one of: ${PALETTES.map((p) => p.id).join(', ')}.`);
  }
  localStorage.setItem(PALETTE_STORAGE_KEY, id);
  applyPalette(id);
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // A change made in another tab.
  const onStorage = (e: StorageEvent): void => {
    if (e.key === PALETTE_STORAGE_KEY) {
      applyPalette(readPalette());
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function usePalette(): [string, (id: string) => void] {
  const id = useSyncExternalStore(subscribe, readPalette);
  return [id, writePalette];
}
