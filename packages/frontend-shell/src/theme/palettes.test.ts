import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PALETTE, PALETTES, applyPalettes, paletteStorageKey, readPalette, writePalette, type PaletteMode } from './palettes.js';

const css = readFileSync(join(process.cwd(), 'src', 'palettes.css'), 'utf8');
const TOKENS = ['--color-bg', '--color-surface', '--color-bg-secondary', '--color-muted-bg', '--color-border', '--palette-chrome'];
const MODES: PaletteMode[] = ['dark', 'light'];

// The selector of a palette block: the dark ones act under .dark, the light ones when it is not there.
const selector = (mode: PaletteMode, id: string): string =>
  mode === 'dark' ? String.raw`html\.dark\[data-palette=["']${id}["']\]` : String.raw`html:not\(\.dark\)\[data-palette-light=["']${id}["']\]`;

function block(mode: PaletteMode, id: string): string | undefined {
  return new RegExp(String.raw`${selector(mode, id)}\s*\{([^}]*)\}`).exec(css)?.[1];
}

function declared(body: string, token: string): string | undefined {
  return new RegExp(String.raw`${token}:\s*(#[0-9a-fA-F]{6})`).exec(body)?.[1]?.toLowerCase();
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-palette');
  document.documentElement.removeAttribute('data-palette-light');
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('PALETTES', () => {
  for (const mode of MODES) {
    describe(mode, () => {
      it('starts with the default one, and every id is unique', () => {
        expect(PALETTES[mode][0]?.id).toBe(DEFAULT_PALETTE);
        expect(new Set(PALETTES[mode].map((p) => p.id)).size).toBe(PALETTES[mode].length);
      });

      for (const palette of PALETTES[mode].filter((p) => p.id !== DEFAULT_PALETTE)) {
        it(`"${palette.id}" has its css block, with every token, and the swatches of the picker are its colors`, () => {
          const body = block(mode, palette.id);
          expect(body, `no ${mode} block for ${palette.id} in palettes.css`).toBeDefined();
          for (const token of TOKENS) {
            expect(body, `${palette.id} lacks ${token}`).toContain(`${token}:`);
          }
          expect(declared(body!, '--palette-chrome')).toBe(palette.chrome);
          expect(declared(body!, '--color-bg')).toBe(palette.bg);
          expect(declared(body!, '--color-surface')).toBe(palette.surface);
        });
      }

      it('has no css block that the picker does not list', () => {
        const pattern = mode === 'dark' ? /html\.dark\[data-palette=['"]([a-z-]+)['"]\]\s*\{/g : /html:not\(\.dark\)\[data-palette-light=['"]([a-z-]+)['"]\]\s*\{/g;
        const inCss = [...css.matchAll(pattern)].map((m) => m[1]);
        expect(inCss.sort()).toEqual(PALETTES[mode].filter((p) => p.id !== DEFAULT_PALETTE).map((p) => p.id).sort());
      });
    });
  }

  it('paints the bars with --palette-chrome in both modes', () => {
    expect(css).toMatch(/html\.dark\[data-palette\] header\.sticky/);
    expect(css).toMatch(/html:not\(\.dark\)\[data-palette-light\] header\.sticky/);
  });
});

describe('the stored palettes', () => {
  it('are the default ones when nothing is stored, and set no attribute', () => {
    for (const mode of MODES) {
      expect(readPalette(mode)).toBe(DEFAULT_PALETTE);
    }
    applyPalettes();
    expect(document.documentElement.hasAttribute('data-palette')).toBe(false);
    expect(document.documentElement.hasAttribute('data-palette-light')).toBe(false);
  });

  it('are stored per mode and put on <html> when chosen, and the attribute goes back with the default', () => {
    writePalette('dark', 'graphite');
    writePalette('light', 'paper');
    expect(localStorage.getItem(paletteStorageKey('dark'))).toBe('graphite');
    expect(localStorage.getItem(paletteStorageKey('light'))).toBe('paper');
    expect(document.documentElement.getAttribute('data-palette')).toBe('graphite');
    expect(document.documentElement.getAttribute('data-palette-light')).toBe('paper');
    writePalette('light', DEFAULT_PALETTE);
    expect(document.documentElement.hasAttribute('data-palette-light')).toBe(false);
    expect(document.documentElement.getAttribute('data-palette')).toBe('graphite');
  });

  it('keep the dark palette in the key the first version used', () => {
    expect(paletteStorageKey('dark')).toBe('app-core.theme.palette');
  });

  it('say so, with the ids of that mode, when the stored value is not one of its palettes, and use the default', () => {
    localStorage.setItem(paletteStorageKey('light'), 'graphite');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(readPalette('light')).toBe(DEFAULT_PALETTE);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"graphite"'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('paper'));
  });

  it('refuse to store a palette of the other mode', () => {
    expect(() => writePalette('light', 'graphite')).toThrow(/graphite/);
    expect(() => writePalette('dark', 'paper')).toThrow(/paper/);
  });
});
