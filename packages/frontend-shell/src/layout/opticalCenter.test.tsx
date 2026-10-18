import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Logo } from './Logo.js';
import { opticalOffset, useOpticalCenter, type InkMetrics } from './opticalCenter.js';

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

  it('moves the caps down when the baseline sits too high in the line box', () => {
    expect(opticalOffset({ ...base, fontAscent: 8, fontDescent: 3 }).y).toBeGreaterThan(0);
  });
});

// jsdom has no 2D canvas (test-setup stubs getContext to null); this one answers with fixed metrics.
const fakeContext = (ink: { left: number; right: number }) =>
  ({
    font: '',
    letterSpacing: '',
    measureText: (text: string) =>
      text === 'H'
        ? { width: 8, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 8, actualBoundingBoxAscent: 8, fontBoundingBoxAscent: 10.66, fontBoundingBoxDescent: 2.66 }
        : { width: 14, actualBoundingBoxLeft: ink.left, actualBoundingBoxRight: ink.right, actualBoundingBoxAscent: 8, fontBoundingBoxAscent: 10.66, fontBoundingBoxDescent: 2.66 },
  }) as unknown as CanvasRenderingContext2D;

function Probe({ enabled }: { enabled: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useOpticalCenter(ref, 'BI', enabled, []);
  return (
    <span ref={ref} data-testid="probe" style={{ fontSize: '11px', lineHeight: '11px' }}>
      BI
    </span>
  );
}

describe('useOpticalCenter', () => {
  const original = HTMLCanvasElement.prototype.getContext;
  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = original;
  });

  const withInk = (left: number, right: number) => {
    HTMLCanvasElement.prototype.getContext = (() => fakeContext({ left, right })) as typeof HTMLCanvasElement.prototype.getContext;
  };

  it('shifts the text so its measured ink is centered (ink 1..10 in a 14px box -> +1.5px)', () => {
    withInk(-1, 10);
    const { getByTestId } = render(<Probe enabled />);
    expect(getByTestId('probe').style.transform).toMatch(/^translate\(1\.50px, -?0\.00px\)$/);
  });

  it('shifts the other way for an ink that sits right of the center (ink 4..14 -> -2px)', () => {
    withInk(-4, 14);
    const { getByTestId } = render(<Probe enabled />);
    expect(getByTestId('probe').style.transform).toMatch(/^translate\(-2\.00px, -?0\.00px\)$/);
  });

  it('clears the transform when the effect is switched off', () => {
    withInk(-1, 10);
    const { getByTestId, rerender } = render(<Probe enabled />);
    expect(getByTestId('probe').style.transform).not.toBe('');
    rerender(<Probe enabled={false} />);
    expect(getByTestId('probe').style.transform).toBe('');
  });

  it('does not write a NaN transform when a metric is missing', () => {
    HTMLCanvasElement.prototype.getContext = (() => ({ font: '', measureText: () => ({ width: 14 }) })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    const { getByTestId } = render(<Probe enabled />);
    expect(getByTestId('probe').style.transform).toBe('');
  });

  it('applies no transform where the canvas cannot measure (jsdom): the text keeps its default centering', () => {
    const { getByTestId } = render(<Probe enabled />);
    expect(getByTestId('probe').style.transform).toBe('');
  });

  it('renders the logo letters untouched in that case', () => {
    const { container } = render(<Logo title="Billing" moduleId="billing" />);
    expect(container.querySelector('[data-logo]')!.textContent).toBe('BI');
  });

  it('applies nothing when disabled', () => {
    const { getByTestId } = render(<Probe enabled={false} />);
    expect(getByTestId('probe').style.transform).toBe('');
  });
});
