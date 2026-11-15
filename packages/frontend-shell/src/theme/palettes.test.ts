import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PALETTE, PALETTES, PALETTE_STORAGE_KEY, readPalette, writePalette } from './palettes.js';

const css = readFileSync(join(process.cwd(), 'src', 'palettes.css'), 'utf8');
const TOKENS = ['--color-bg', '--color-surface', '--color-bg-secondary', '--color-muted-bg', '--color-border', '--palette-chrome'];

function block(id: string): string | undefined {
  return new RegExp(String.raw`html\.dark\[data-palette=["']${id}["']\]\s*\{([^}]*)\}`).exec(css)?.[1];
}

function declared(body: string, token: string): string | undefined {
  return new RegExp(String.raw`${token}:\s*(#[0-9a-fA-F]{6})`).exec(body)?.[1]?.toLowerCase();
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-palette');
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('PALETTES', () => {
  it('starts with the default one, and every id is unique', () => {
    expect(PALETTES[0]?.id).toBe(DEFAULT_PALETTE);
    expect(new Set(PALETTES.map((p) => p.id)).size).toBe(PALETTES.length);
  });

  for (const palette of PALETTES.filter((p) => p.id !== DEFAULT_PALETTE)) {
    it(`"${palette.id}" has its css block, with every token, and the swatches of the picker are its colors`, () => {
      const body = block(palette.id);
      expect(body, `no block for ${palette.id} in palettes.css`).toBeDefined();
      for (const token of TOKENS) {
        expect(body, `${palette.id} lacks ${token}`).toContain(`${token}:`);
      }
      expect(declared(body!, '--palette-chrome')).toBe(palette.chrome);
      expect(declared(body!, '--color-bg')).toBe(palette.bg);
      expect(declared(body!, '--color-surface')).toBe(palette.surface);
    });
  }

  it('has no css block that the picker does not list', () => {
    const inCss = [...css.matchAll(/html\.dark\[data-palette=['"]([a-z-]+)['"]\]\s*\{/g)].map((m) => m[1]);
    expect(inCss.sort()).toEqual(PALETTES.filter((p) => p.id !== DEFAULT_PALETTE).map((p) => p.id).sort());
  });
});

describe('the stored palette', () => {
  it('is the default one when nothing is stored, and sets no attribute', () => {
    expect(readPalette()).toBe(DEFAULT_PALETTE);
    expect(document.documentElement.hasAttribute('data-palette')).toBe(false);
  });

  it('is stored and put on <html> when chosen, and the attribute goes back with the default', () => {
    writePalette('graphite');
    expect(localStorage.getItem(PALETTE_STORAGE_KEY)).toBe('graphite');
    expect(document.documentElement.getAttribute('data-palette')).toBe('graphite');
    writePalette(DEFAULT_PALETTE);
    expect(document.documentElement.hasAttribute('data-palette')).toBe(false);
  });

  it('says so, with the known ids, when the stored value is not a palette, and uses the default', () => {
    localStorage.setItem(PALETTE_STORAGE_KEY, 'neon');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(readPalette()).toBe(DEFAULT_PALETTE);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"neon"'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('graphite'));
  });

  it('refuses to store an unknown palette', () => {
    expect(() => writePalette('neon')).toThrow(/neon/);
  });
});
