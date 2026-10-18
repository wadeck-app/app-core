import { useLayoutEffect, type RefObject } from 'react';

// Text boxes are centered on their advance width, so a pair like "BI" (narrow ink, wide side bearings) and "RE"
// (ink nearly as wide as the box) do not look centered the same way. This measures the real ink and offsets it.
export interface InkMetrics {
  // Advance width of the string (what CSS centers).
  width: number;
  // actualBoundingBox*: distance from the origin to the left / right edge of the drawn ink (Left > 0 = ink starts left of the origin).
  inkLeft: number;
  inkRight: number;
  // Font ascent / descent and cap height, in px.
  fontAscent: number;
  fontDescent: number;
  capHeight: number;
  // Height of the line box the text is centered in.
  lineHeight: number;
}

// Translation (px) that centers the ink horizontally and the capital letters vertically in the line box.
// Vertical uses the cap height, not the string's ink, so a "Q" tail does not push the pair up.
export function opticalOffset(m: InkMetrics): { x: number; y: number } {
  const x = m.width / 2 - (m.inkRight - m.inkLeft) / 2;
  const baselineFromTop = (m.lineHeight - (m.fontAscent + m.fontDescent)) / 2 + m.fontAscent;
  const y = m.lineHeight / 2 - baselineFromTop + m.capHeight / 2;
  return { x, y };
}

let canvas: CanvasRenderingContext2D | null | undefined;
const context = (): CanvasRenderingContext2D | null => {
  canvas ??= document.createElement('canvas').getContext('2d');
  return canvas;
};

function measure(el: HTMLElement, text: string): InkMetrics | undefined {
  const ctx = context();
  // No 2D canvas (e.g. jsdom): nothing can be measured, the text keeps its default centering.
  if (!ctx) return undefined;
  const cs = getComputedStyle(el);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
  const t = ctx.measureText(text);
  const fontSize = parseFloat(cs.fontSize);
  return {
    width: t.width,
    inkLeft: t.actualBoundingBoxLeft,
    inkRight: t.actualBoundingBoxRight,
    fontAscent: t.fontBoundingBoxAscent,
    fontDescent: t.fontBoundingBoxDescent,
    capHeight: ctx.measureText('H').actualBoundingBoxAscent,
    lineHeight: cs.lineHeight === 'normal' ? fontSize * 1.2 : parseFloat(cs.lineHeight),
  };
}

// Applies the optical offset to `ref` (a text span inside the chip). Re-measures once the fonts are loaded.
export function useOpticalCenter(ref: RefObject<HTMLElement | null>, text: string, enabled: boolean, deps: readonly unknown[]): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!enabled) {
      el.style.transform = '';
      return;
    }
    const apply = (): void => {
      const m = measure(el, text);
      if (!m) return;
      const { x, y } = opticalOffset(m);
      el.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
    };
    apply();
    // Inter may not be loaded at first paint: measuring with the fallback font would be wrong.
    void document.fonts?.ready.then(apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, enabled, ...deps]);
}
