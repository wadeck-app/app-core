import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { logoOf, moduleColor } from './Logo.js';
import { accentCss, useModuleAccent } from './moduleAccent.js';

describe('logoOf', () => {
  it('uses the first two letters of a single word, and the first letter of the first two words otherwise', () => {
    expect(logoOf('Queue')).toBe('QU');
    expect(logoOf('Orchestrator')).toBe('OR');
    expect(logoOf('Audit log')).toBe('AL');
    expect(logoOf('Payment methods and more')).toBe('PM');
  });

  it("'initial' keeps one letter", () => {
    expect(logoOf('Audit log', 'initial')).toBe('A');
  });

  it('copes with a one-letter name and an empty one', () => {
    expect(logoOf('X')).toBe('X');
    expect(logoOf('')).toBe('?');
  });
});

describe('moduleColor', () => {
  it('is stable for a given id and always a hex color', () => {
    expect(moduleColor('queue')).toBe(moduleColor('queue'));
    expect(moduleColor('queue')).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('gives the two real modules different colors', () => {
    expect(moduleColor('queue')).not.toBe(moduleColor('orchestrator'));
  });

  it('spreads modules over several colors', () => {
    const colors = new Set(['queue', 'orchestrator', 'billing', 'inventory', 'reports', 'audit-log', 'settings'].map(moduleColor));
    expect(colors.size).toBeGreaterThan(3);
  });
});

describe('accentCss', () => {
  const css = accentCss('#7c3aed');

  it('redefines only the accent family, never backgrounds or text colors', () => {
    const vars = [...css.matchAll(/--[a-z-]+(?=:)/g)].map((m) => m[0]);
    expect(new Set(vars)).toEqual(new Set(['--color-primary', '--color-primary-solid', '--color-primary-solid-hover', '--color-primary-light']));
  });

  it('has one rule for the light theme and one for the dark theme, the latter coming last', () => {
    expect(css.indexOf('html:root')).toBeGreaterThanOrEqual(0);
    expect(css.indexOf('html.dark')).toBeGreaterThan(css.indexOf('html:root'));
    expect(css).toContain("html[data-theme='dark']");
  });
});

describe('useModuleAccent', () => {
  afterEach(() => {
    document.head.querySelectorAll('[data-module-accent]').forEach((n) => n.remove());
  });

  function Probe({ color }: { color: string | undefined }) {
    useModuleAccent(color);
    return null;
  }
  const injected = () => Array.from(document.head.querySelectorAll('[data-module-accent]'));

  it('injects the accent while mounted and removes it on unmount', () => {
    const { unmount } = render(<Probe color="#0284c7" />);
    expect(injected()).toHaveLength(1);
    expect(injected()[0].textContent).toContain('#0284c7');
    unmount();
    expect(injected()).toHaveLength(0);
  });

  it('replaces the accent when the module changes, without leaving the previous one behind', () => {
    const { rerender } = render(<Probe color="#0284c7" />);
    rerender(<Probe color="#e11d48" />);
    expect(injected()).toHaveLength(1);
    expect(injected()[0].textContent).toContain('#e11d48');
  });

  it('injects nothing without a color (dashboard, or toggle off)', () => {
    const { rerender } = render(<Probe color="#0284c7" />);
    rerender(<Probe color={undefined} />);
    expect(injected()).toHaveLength(0);
  });
});
