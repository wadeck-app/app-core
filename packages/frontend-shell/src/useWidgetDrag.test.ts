import { describe, expect, it } from 'vitest';
import { edgeScrollSpeed } from './useWidgetDrag.js';

describe('edgeScrollSpeed', () => {
  it('does not scroll away from the edges', () => {
    expect(edgeScrollSpeed(80, 1000)).toBe(0);
    expect(edgeScrollSpeed(500, 1000)).toBe(0);
    expect(edgeScrollSpeed(920, 1000)).toBe(0);
  });

  it('scrolls up near the top and down near the bottom', () => {
    expect(edgeScrollSpeed(40, 1000)).toBeLessThan(0);
    expect(edgeScrollSpeed(960, 1000)).toBeGreaterThan(0);
  });

  it('goes faster the closer to the edge, up to a limit, and the same beyond it', () => {
    expect(Math.abs(edgeScrollSpeed(10, 1000))).toBeGreaterThan(Math.abs(edgeScrollSpeed(60, 1000)));
    expect(edgeScrollSpeed(0, 1000)).toBe(-18);
    expect(edgeScrollSpeed(-500, 1000)).toBe(-18);
    expect(edgeScrollSpeed(1000, 1000)).toBe(18);
    expect(edgeScrollSpeed(1500, 1000)).toBe(18);
  });
});
