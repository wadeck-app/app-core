import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { AbExperiments } from '@wadeck-app/dsl-ui';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PALETTE_IDS, PaletteAbTest } from './PaletteAbTest.js';

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  document.documentElement.removeAttribute('data-palette');
});

function mount(): void {
  render(
    <AbExperiments enabled>
      <PaletteAbTest />
    </AbExperiments>,
  );
}

describe('PaletteAbTest', () => {
  it('leaves the theme alone on the reference palette', () => {
    mount();
    expect(document.documentElement.hasAttribute('data-palette')).toBe(false);
  });

  it('applies the stored palette to the document, so every page follows it', () => {
    window.localStorage.setItem('ab.palette', 'graphite');
    mount();
    expect(document.documentElement.getAttribute('data-palette')).toBe('graphite');
  });

  it('puts the dock row in the one dock of the app', () => {
    mount();
    expect(document.querySelector('[data-testid="ab-dock"]')?.textContent).toContain('Palette');
  });
});

describe('palettes.css', () => {
  const css = readFileSync(join(process.cwd(), 'src', 'palettes.css'), 'utf8');
  const tokens = ['--color-bg', '--color-surface', '--color-bg-secondary', '--color-muted-bg', '--color-border', '--palette-chrome'];

  for (const id of PALETTE_IDS) {
    it(`declares every token of "${id}", for the dark theme only`, () => {
      const block = new RegExp(`html\\.dark\\[data-palette=["']${id}["']\\]\\s*\\{([^}]*)\\}`).exec(css);
      expect(block, `no block for ${id}`).not.toBeNull();
      for (const token of tokens) {
        expect(block![1], `${id} lacks ${token}`).toContain(`${token}:`);
      }
    });
  }
});
