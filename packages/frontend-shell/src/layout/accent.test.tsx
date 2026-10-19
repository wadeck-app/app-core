import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ACCENT_VARIABLES, accentVariables } from './accent.js';
import { AccentScope } from './AccentScope.js';
import { useRootAccent } from './useRootAccent.js';

describe('accentVariables', () => {
  const vars = accentVariables('#7c3aed');

  it('redefines only the accent family, never backgrounds or text colors', () => {
    expect(Object.keys(vars)).toEqual([...ACCENT_VARIABLES]);
    expect(Object.keys(vars).every((name) => name.startsWith('--color-primary'))).toBe(true);
  });

  it('keeps the given color as the solid fill', () => {
    expect(vars['--color-primary-solid']).toBe('#7c3aed');
  });

  it('puts light and dark values in the same declaration with light-dark(), light first', () => {
    for (const name of ['--color-primary', '--color-primary-light'] as const) {
      expect(vars[name], name).toMatch(/^light-dark\(.+, .+\)$/);
    }
    // Text accent: the color itself on light, a lighter tint on dark.
    expect(vars['--color-primary']).toBe('light-dark(#7c3aed, color-mix(in srgb, #7c3aed 60%, white))');
    // Tinted background: almost white on light, a deep tint on dark.
    expect(vars['--color-primary-light']).toBe('light-dark(color-mix(in srgb, #7c3aed 10%, white), color-mix(in srgb, #7c3aed 28%, #0b1120))');
  });

  it('has a darker hover fill, the same in both themes', () => {
    expect(vars['--color-primary-solid-hover']).toBe('color-mix(in srgb, #7c3aed 85%, black)');
  });

  it('is pure: the same input gives the same output, different colors give different variables', () => {
    expect(accentVariables('#7c3aed')).toEqual(vars);
    expect(accentVariables('#0284c7')).not.toEqual(vars);
  });
});

describe('AccentScope', () => {
  const scope = () => screen.getByTestId('content').parentElement!;

  it('sets the accent variables on a wrapper around its children and takes no part in the layout', () => {
    render(
      <AccentScope color="#0284c7">
        <p data-testid="content">x</p>
      </AccentScope>,
    );
    expect(scope().className).toContain('contents');
    for (const [name, value] of Object.entries(accentVariables('#0284c7'))) expect(scope().style.getPropertyValue(name), name).toBe(value);
  });

  it('sets nothing without a color, and keeps the same wrapper so the children never remount', () => {
    const { rerender } = render(
      <AccentScope color={undefined}>
        <p data-testid="content">x</p>
      </AccentScope>,
    );
    const before = scope();
    for (const name of ACCENT_VARIABLES) expect(before.style.getPropertyValue(name), name).toBe('');

    rerender(
      <AccentScope color="#e11d48">
        <p data-testid="content">x</p>
      </AccentScope>,
    );
    expect(scope()).toBe(before);
    expect(scope().style.getPropertyValue('--color-primary-solid')).toBe('#e11d48');
  });

  it('nests: the inner scope wins inside, the outer one stays around it', () => {
    render(
      <AccentScope color="#0284c7">
        <p data-testid="outer">outer</p>
        <AccentScope color="#e11d48">
          <p data-testid="inner">inner</p>
        </AccentScope>
      </AccentScope>,
    );
    expect(screen.getByTestId('outer').parentElement!.style.getPropertyValue('--color-primary-solid')).toBe('#0284c7');
    expect(screen.getByTestId('inner').parentElement!.style.getPropertyValue('--color-primary-solid')).toBe('#e11d48');
  });
});

describe('useRootAccent', () => {
  const root = () => document.documentElement.style;
  const names = () => ACCENT_VARIABLES.map((n) => root().getPropertyValue(n));

  afterEach(() => {
    for (const n of ACCENT_VARIABLES) root().removeProperty(n);
  });

  function Probe({ color }: { color: string | undefined }) {
    useRootAccent(color);
    return null;
  }

  it('sets the four variables on <html> while mounted and removes them on unmount', () => {
    const { unmount } = render(<Probe color="#0284c7" />);
    expect(names()).toEqual(Object.values(accentVariables('#0284c7')));
    unmount();
    expect(names()).toEqual(['', '', '', '']);
  });

  it('replaces the accent when the color changes, leaving nothing of the previous one', () => {
    const { rerender } = render(<Probe color="#0284c7" />);
    rerender(<Probe color="#e11d48" />);
    expect(names()).toEqual(Object.values(accentVariables('#e11d48')));
  });

  it('sets nothing without a color', () => {
    const { rerender } = render(<Probe color="#0284c7" />);
    rerender(<Probe color={undefined} />);
    expect(names()).toEqual(['', '', '', '']);
  });

  it('does not touch the stylesheet: no <style> is injected', () => {
    const before = document.head.querySelectorAll('style').length;
    render(<Probe color="#0284c7" />);
    expect(document.head.querySelectorAll('style').length).toBe(before);
  });
});
