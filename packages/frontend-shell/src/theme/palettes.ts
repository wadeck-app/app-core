import { useSyncExternalStore } from 'react';

export type PaletteMode = 'dark' | 'light';

export const DEFAULT_PALETTE = 'default';

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

// The palettes of each mode: the picker lists the ones of the mode that is on, in this order. palettes.css has one block per id but the
// default one (the dsl-ui theme as it is).
export const PALETTES: Readonly<Record<PaletteMode, readonly Palette[]>> = {
  dark: [
    { id: DEFAULT_PALETTE, label: 'Default', hint: 'The theme as it is: near-black page, lighter blue-gray cards and menus.', chrome: '#1e293b', bg: '#020617', surface: '#1e293b' },
    { id: 'graphite', label: 'Graphite', hint: 'Neutral gray, no tint. Page and cards close together; menus darkest.', chrome: '#0b0c0e', bg: '#16171a', surface: '#1c1e22' },
    { id: 'night', label: 'Night', hint: 'Deep blue like the default but lifted and softer. Menus darkest.', chrome: '#060a13', bg: '#0e1422', surface: '#131a2b' },
    { id: 'warm', label: 'Warm', hint: 'Brown-gray with a warmer text. Menus darkest.', chrome: '#0c0a09', bg: '#181614', surface: '#1e1c19' },
    { id: 'dusk', label: 'Dusk', hint: 'Lighter blue-gray, the least contrast of all: nothing is near-black.', chrome: '#13161c', bg: '#1c2029', surface: '#232834' },
    { id: 'plum', label: 'Plum', hint: 'Purple-gray. Menus darkest.', chrome: '#0e0c12', bg: '#17141c', surface: '#1d1a24' },
    { id: 'wine', label: 'Wine', hint: 'Red-brown gray. Menus darkest.', chrome: '#0f0b0d', bg: '#1a1417', surface: '#211a1e' },
    { id: 'olive', label: 'Olive', hint: 'Yellow-green gray. Menus darkest.', chrome: '#0d0f0a', bg: '#171a14', surface: '#1d2018' },
  ],
  light: [
    { id: DEFAULT_PALETTE, label: 'Default', hint: 'The theme as it is: white menus and cards on a pale blue-gray page.', chrome: '#ffffff', bg: '#f8fafc', surface: '#ffffff' },
    { id: 'paper', label: 'Paper', hint: 'Warm off-white, like paper. Menus a shade darker than the page, cards lighter.', chrome: '#ebe6dc', bg: '#f5f2ec', surface: '#fbf9f5' },
    { id: 'mist', label: 'Mist', hint: 'Cool blue-gray, soft. Menus a shade darker than the page.', chrome: '#e2e7ee', bg: '#eef1f5', surface: '#f7f9fb' },
    { id: 'sage', label: 'Sage', hint: 'Soft green-gray. Menus a shade darker than the page.', chrome: '#e3e9e1', bg: '#eff2ee', surface: '#f8faf7' },
    { id: 'rose', label: 'Rose', hint: 'Soft pink-gray. Menus a shade darker than the page.', chrome: '#eae1e3', bg: '#f4eff0', surface: '#faf7f7' },
    { id: 'cloud', label: 'Cloud', hint: 'Neutral light gray, no tint. Menus a shade darker than the page.', chrome: '#e5e7ea', bg: '#f1f2f4', surface: '#f8f8f9' },
  ],
};

// localStorage key and <html> attribute of each mode. The dark ones are the first ones shipped, so they keep their names.
const STORAGE_KEY: Readonly<Record<PaletteMode, string>> = { dark: 'app-core.theme.palette', light: 'app-core.theme.palette-light' };
const ATTRIBUTE: Readonly<Record<PaletteMode, string>> = { dark: 'data-palette', light: 'data-palette-light' };
const MODES: readonly PaletteMode[] = ['dark', 'light'];

export const paletteStorageKey = (mode: PaletteMode): string => STORAGE_KEY[mode];

const ids = (mode: PaletteMode): string[] => PALETTES[mode].map((p) => p.id);
const listeners = new Set<() => void>();
const warned = new Set<string>();

// The stored palette of a mode. A value that is not a palette of that mode is said once, with the known ids, and the default applies:
// never used silently.
export function readPalette(mode: PaletteMode): string {
  const key = STORAGE_KEY[mode];
  const stored = localStorage.getItem(key);
  if (stored === null || stored === DEFAULT_PALETTE) {
    return DEFAULT_PALETTE;
  }
  if (ids(mode).includes(stored)) {
    return stored;
  }
  const warning = `${key}=${stored}`;
  if (!warned.has(warning)) {
    warned.add(warning);
    console.warn(`[theme] Ignoring unknown ${mode} palette "${stored}" in localStorage "${key}"; expected one of: ${ids(mode).join(', ')}. The default palette is used.`);
  }
  return DEFAULT_PALETTE;
}

// <html data-palette="..."> (dark) and <html data-palette-light="..."> (light): palettes.css reads each one under its own mode, so
// both can be set at once and the mode that is on decides. The default palette sets nothing.
export function applyPalettes(): void {
  const root = document.documentElement;
  for (const mode of MODES) {
    const id = readPalette(mode);
    if (id === DEFAULT_PALETTE) {
      root.removeAttribute(ATTRIBUTE[mode]);
    } else {
      root.setAttribute(ATTRIBUTE[mode], id);
    }
  }
}

export function writePalette(mode: PaletteMode, id: string): void {
  if (!ids(mode).includes(id)) {
    throw new Error(`Unknown ${mode} palette "${id}"; expected one of: ${ids(mode).join(', ')}.`);
  }
  localStorage.setItem(STORAGE_KEY[mode], id);
  applyPalettes();
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // A change made in another tab.
  const onStorage = (e: StorageEvent): void => {
    if (e.key === STORAGE_KEY.dark || e.key === STORAGE_KEY.light) {
      applyPalettes();
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function usePalette(mode: PaletteMode): [string, (id: string) => void] {
  const id = useSyncExternalStore(subscribe, () => readPalette(mode));
  return [id, (next) => writePalette(mode, next)];
}
