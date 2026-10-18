import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { moduleColor } from './Logo.js';
import { ModuleTabs } from './ModuleTabs.js';
import type { TabHighlight } from './tabHighlight.js';
import { FIXTURE_NAV } from './testFixtures.js';

const billing = FIXTURE_NAV[0];
const color = moduleColor('billing');

// Expected values go through the same CSS serialization as the rendered ones, so the comparison is exact whatever
// normalization the environment applies; the sanity test below fails loudly if the environment drops the value.
const asBackground = (css: string): string => {
  const probe = document.createElement('i');
  probe.style.background = css;
  return probe.style.background;
};
const asBackgroundImage = (css: string): string => {
  const probe = document.createElement('i');
  probe.style.backgroundImage = css;
  return probe.style.backgroundImage;
};

const fade = `color-mix(in srgb, ${color} 28%, transparent)`;

const tabs = (highlight: TabHighlight) => {
  render(
    <MemoryRouter initialEntries={[billing.basePath]}>
      <ModuleTabs navModules={FIXTURE_NAV} highlight={highlight} />
    </MemoryRouter>,
  );
  const nav = within(screen.getByRole('navigation', { name: 'Modules' }));
  return { active: nav.getByRole('link', { name: 'Billing' }), inactive: nav.getByRole('link', { name: 'Inventory' }), dashboard: nav.getByRole('link', { name: 'Dashboard' }) };
};

describe('environment sanity', () => {
  it('keeps color-mix gradients (otherwise the comparisons below would be vacuous)', () => {
    expect(asBackground(`linear-gradient(90deg, ${fade}, transparent)`)).not.toBe('');
  });
});

// All of these use the module color only (no second hue) and keep the logo plain and at its single size.
describe('variants of Gradient', () => {
  const stretches = (t: ReturnType<typeof tabs>) => {
    // The tab fills the height of the top bar, active or not (same hover area), with no vertical padding of its own.
    for (const el of [t.active, t.inactive, t.dashboard]) {
      expect(el.className).toContain('self-stretch');
      expect(el.className).not.toMatch(/\bpy-/);
    }
  };

  it('gradient (reference): fades out to the right, with a solid bar on the left edge', () => {
    const t = tabs('gradient');
    expect(t.active.style.background).toBe(asBackground(`linear-gradient(90deg, ${fade}, transparent)`));
    expect(t.active.style.boxShadow).toContain('inset 3px 0 0');
    expect(t.inactive.style.background).toBe('');
  });

  it('gradientSoft: the same gradient without the left bar', () => {
    const t = tabs('gradientSoft');
    expect(t.active.style.background).toBe(asBackground(`linear-gradient(90deg, ${fade}, transparent)`));
    expect(t.active.style.boxShadow).toBe('');
  });

  it('gradientFull: the same gradient on a tab as tall as the bar', () => {
    const t = tabs('gradientFull');
    expect(t.active.style.background).toBe(asBackground(`linear-gradient(90deg, ${fade}, transparent)`));
    stretches(t);
  });

  it('gradientEdges: the color at both edges, meeting in the middle', () => {
    const t = tabs('gradientEdges');
    expect(t.active.style.background).toBe(asBackground(`linear-gradient(90deg, ${fade}, transparent 50%, ${fade})`));
    expect(t.active.style.boxShadow).toBe('');
  });

  it('gradientEdgesInv: the reverse of Edges, transparent at both edges and strongest in the middle', () => {
    const t = tabs('gradientEdgesInv');
    expect(t.active.style.background).toBe(asBackground(`linear-gradient(90deg, transparent, ${fade} 50%, transparent)`));
    expect(t.active.style.boxShadow).toBe('');
  });

  it('gradientFullDown: full height, running from the top (strongest) to the bottom (gone)', () => {
    const t = tabs('gradientFullDown');
    expect(t.active.style.background).toBe(asBackground(`linear-gradient(180deg, ${fade}, transparent)`));
    stretches(t);
  });

  it('gradientFullUp: full height, running from the bottom (strongest) to the top (gone)', () => {
    const t = tabs('gradientFullUp');
    expect(t.active.style.background).toBe(asBackground(`linear-gradient(0deg, ${fade}, transparent)`));
    stretches(t);
  });

  it('gradientFullEdges: full height, with the color starting at both edges', () => {
    const t = tabs('gradientFullEdges');
    expect(t.active.style.background).toBe(asBackground(`linear-gradient(90deg, ${fade}, transparent 50%, ${fade})`));
    stretches(t);
  });

  it('gradientUnder: the fade with a solid bar along the bottom edge, not the left one', () => {
    const t = tabs('gradientUnder');
    expect(t.active.style.background).toBe(asBackground(`linear-gradient(90deg, ${fade}, transparent)`));
    expect(t.active.style.boxShadow).toContain('inset 0 -2px 0');
    expect(t.active.style.boxShadow).not.toContain('inset 3px 0 0');
  });

  it('every one of them leaves the inactive tabs plain and the logo solid', () => {
    for (const h of ['gradientSoft', 'gradientFull', 'gradientEdges', 'gradientEdgesInv', 'gradientFullDown', 'gradientFullUp', 'gradientFullEdges', 'gradientUnder'] as const) {
      document.body.innerHTML = '';
      const t = tabs(h);
      expect(t.inactive.style.background, h).toBe('');
      expect(t.inactive.style.boxShadow, h).toBe('');
      expect(t.active.querySelector('[data-logo]')!.getAttribute('data-tone'), h).toBe('solid');
    }
  });
});

describe('innerGlow', () => {
  it('has no fill: a thin tinted edge and a soft inner glow', () => {
    const t = tabs('innerGlow');
    expect(t.active.style.background).toBe('');
    expect(t.active.style.boxShadow.match(/inset/g)).toHaveLength(2);
    expect(t.inactive.style.boxShadow).toBe('');
  });
});

describe('sweepSoft (a calmer Sweep)', () => {
  it('runs from the right to the left, ends on a lighter tint of the module color and has a lighter highlight', () => {
    const sweep = tabs('sweep').active.style.backgroundImage;
    document.body.innerHTML = '';
    const soft = tabs('sweepSoft').active;
    expect(soft.style.backgroundImage).toBe(
      asBackgroundImage(`linear-gradient(245deg, rgba(255,255,255,0.18), transparent 45%), linear-gradient(270deg, ${color}, color-mix(in srgb, ${color} 72%, white))`),
    );
    // Sweep goes to the left-to-right diagonal and ends on a dark shade of the module color; Sweep soft does neither.
    expect(sweep).toContain('135deg');
    expect(sweep).toContain('black');
    expect(soft.style.backgroundImage).toContain('270deg');
    expect(soft.style.backgroundImage).not.toContain('black');
    expect(soft.style.backgroundImage).not.toContain('135deg');
    expect(soft.className).toContain('text-white');
  });
});
