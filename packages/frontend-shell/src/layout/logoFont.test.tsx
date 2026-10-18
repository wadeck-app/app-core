import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo } from './Logo.js';
import { LOGO_FONTS, LogoFontContext, type LogoFont } from './logoFont.js';
import { opticalOffset, type InkMetrics } from './opticalCenter.js';

const logo = (font: LogoFont) => {
  const { container } = render(
    <LogoFontContext.Provider value={font}>
      <Logo title="Billing" moduleId="billing" mode="duo-colored" baseColor="" />
    </LogoFontContext.Provider>,
  );
  return container.querySelector<HTMLElement>('[data-logo]')!;
};

describe('opticalOffset', () => {
  // Inter-like numbers at 11px.
  const base: InkMetrics = { width: 14, inkLeft: 0, inkRight: 14, fontAscent: 10.66, fontDescent: 2.66, capHeight: 8, lineHeight: 11 };

  it('needs no offset when the ink fills the advance box and the caps are centered in the line', () => {
    const { x, y } = opticalOffset(base);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0, 0);
  });

  it('shifts right an ink that sits left of the box center, left one that sits right of it', () => {
    // "BI"-like: advance 14 but the ink spans only x = 1..10 -> ink center 5.5 < 7.
    expect(opticalOffset({ ...base, inkLeft: -1, inkRight: 10 }).x).toBeCloseTo(1.5);
    // Ink spans x = 4..14 -> ink center 9 > 7.
    expect(opticalOffset({ ...base, inkLeft: -4, inkRight: 14 }).x).toBeCloseTo(-2);
  });

  it('is unaffected by a descender: vertical uses the cap height, not the ink of the string', () => {
    expect(opticalOffset({ ...base, fontDescent: 2.66 }).y).toBe(opticalOffset(base).y);
  });

  it('moves the caps down when the baseline sits too high in the line box', () => {
    expect(opticalOffset({ ...base, fontAscent: 8, fontDescent: 3 }).y).toBeGreaterThan(0);
  });
});

describe('Logo fonts', () => {
  it('offers the five fonts', () => {
    expect(Object.keys(LOGO_FONTS)).toEqual(['inter', 'optical', 'mono', 'cells', 'serif']);
  });

  it('inter: plain text, tight tracking', () => {
    const l = logo('inter');
    expect(l.textContent).toBe('BI');
    expect(l.className).toContain('tracking-tighter');
  });

  it('mono and serif use their font family', () => {
    expect(logo('mono').className).toContain('font-mono');
  });

  it('serif uses its font family', () => {
    expect(logo('serif').className).toContain('font-serif');
  });

  it('cells: one equal-width cell per letter', () => {
    const l = logo('cells');
    const cells = l.querySelectorAll('span.w-\\[0\\.72em\\]');
    expect(Array.from(cells).map((c) => c.textContent)).toEqual(['B', 'I']);
  });

  it('optical: renders and keeps the text when the canvas cannot measure (jsdom)', () => {
    const l = logo('optical');
    expect(l.textContent).toBe('BI');
  });
});
