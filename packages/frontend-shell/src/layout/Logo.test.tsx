import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InitialsTile } from './InitialsTile.js';
import { Logo, moduleColor } from './Logo.js';

const cssColor = (value: string): string => {
  const probe = document.createElement('i');
  probe.style.backgroundColor = value;
  return probe.style.backgroundColor;
};

describe('moduleColor', () => {
  it('is stable for a given id and always a hex color', () => {
    expect(moduleColor('queue')).toBe(moduleColor('queue'));
    expect(moduleColor('queue')).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('gives the two real modules different colors', () => {
    expect(moduleColor('queue')).not.toBe(moduleColor('orchestrator'));
  });
});

describe('InitialsTile', () => {
  it('shows the text in white on the given color, hidden from assistive technology', () => {
    const { container } = render(<InitialsTile text="QU" color="#c026d3" />);
    const tile = container.querySelector<HTMLElement>('[data-logo]')!;
    expect(tile.textContent).toBe('QU');
    expect(tile).toHaveAttribute('aria-hidden', 'true');
    expect(tile.style.backgroundColor).toBe(cssColor('#c026d3'));
    expect(tile.className).toContain('text-white');
  });

  it('has one size, whatever the text', () => {
    const { container } = render(
      <>
        <InitialsTile text="A" color="#000" />
        <InitialsTile text="ABC" color="#000" />
      </>,
    );
    const sizes = Array.from(container.querySelectorAll<HTMLElement>('[data-logo]')).map((t) => t.className.split(/\s+/).filter((c) => /^(h-|min-w-|px-|text-\[)/.test(c)).sort());
    expect(sizes[0]).toEqual(sizes[1]);
    expect(sizes[0]).toContain('h-5');
  });
});

describe('Logo', () => {
  it('is the initials of the title on the color of the module id', () => {
    const { container } = render(<Logo title="Billing" moduleId="billing" />);
    const logo = container.querySelector<HTMLElement>('[data-logo]')!;
    expect(logo.textContent).toBe('BI');
    expect(logo.style.backgroundColor).toBe(cssColor(moduleColor('billing')));
  });

  it('keeps the color of the id when the title changes', () => {
    const a = render(<Logo title="Billing" moduleId="billing" />).container.querySelector<HTMLElement>('[data-logo]')!.style.backgroundColor;
    const b = render(<Logo title="Payments" moduleId="billing" />).container.querySelector<HTMLElement>('[data-logo]')!.style.backgroundColor;
    expect(b).toBe(a);
  });
});
