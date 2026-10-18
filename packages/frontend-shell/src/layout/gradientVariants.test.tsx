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

// The rendered paint of the active tab (the linear styles set `background`, the radial ones `background-image`).
// Clears the document first, so it can be called several times in one test.
const paintOf = (h: TabHighlight): string => {
  document.body.innerHTML = '';
  const style = tabs(h).active.style;
  return style.background || style.backgroundImage;
};

describe('environment sanity', () => {
  // Without these, an "expected equals rendered" comparison could pass on two empty strings.
  it('keeps color-mix linear gradients', () => {
    expect(asBackground(`linear-gradient(90deg, ${fade}, transparent)`)).not.toBe('');
  });

  it('keeps color-mix radial gradients through background-image', () => {
    expect(asBackgroundImage(`radial-gradient(75% 100% at 50% 100%, ${fade}, transparent 100%)`)).not.toBe('');
  });

  it('every radial variant is really rendered (not dropped by the environment)', () => {
    for (const h of ['upBlend', 'upGlowSoft', 'upGlowLine', 'upGlowTall', 'upGlowWide', 'fullUpGlow'] as const) {
      document.body.innerHTML = '';
      expect(tabs(h).active.style.backgroundImage, h).toContain('radial-gradient');
    }
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
  it('runs from the right to the left, from the module color to a slightly more transparent version of it', () => {
    const sweep = tabs('sweep').active.style.backgroundImage;
    document.body.innerHTML = '';
    const soft = tabs('sweepSoft').active;
    expect(soft.style.backgroundImage).toBe(
      asBackgroundImage(`linear-gradient(245deg, rgba(255,255,255,0.18), transparent 45%), linear-gradient(270deg, ${color}, color-mix(in srgb, ${color} 78%, transparent))`),
    );
    // Sweep goes along a diagonal and ends on a dark shade of the module color; Sweep soft does neither.
    expect(sweep).toContain('135deg');
    expect(sweep).toContain('black');
    expect(soft.style.backgroundImage).toContain('270deg');
    expect(soft.style.backgroundImage).not.toContain('black');
    expect(soft.style.backgroundImage).not.toContain('135deg');
    expect(soft.className).toContain('text-white');
  });

  it('never mixes the module color with white: the module color stays the dominant color of the pill', () => {
    const soft = tabs('sweepSoft').active.style.backgroundImage;
    expect(soft).not.toMatch(/white|#fff\b/i);
    // The only white in it is the translucent highlight (rgba 255,255,255 at 18%).
    expect(soft.match(/255, ?255, ?255/g)).toHaveLength(1);
  });
});

// Four takes on Full up (bottom to top, full height), all in the module color.
describe('variants of Full up', () => {
  const upTabs = ['gradientFullUp', 'fullUpStrong', 'fullUpSoft', 'fullUpGlow', 'fullUpDeep'] as const;
  const bgOf = paintOf;

  it('fullUpStrong: the same direction as Full up with a stronger color', () => {
    expect(bgOf('fullUpStrong')).toBe(asBackground(`linear-gradient(0deg, color-mix(in srgb, ${color} 50%, transparent), transparent 90%)`));
  });

  it('fullUpSoft: the same direction as Full up with a very light color', () => {
    expect(bgOf('fullUpSoft')).toBe(asBackground(`linear-gradient(0deg, color-mix(in srgb, ${color} 14%, transparent), transparent)`));
  });

  it('fullUpGlow: a radial glow centered on the bottom edge, so the sides are softer than the center', () => {
    const bg = bgOf('fullUpGlow');
    expect(bg).toBe(asBackgroundImage(`radial-gradient(75% 100% at 50% 100%, color-mix(in srgb, ${color} 50%, transparent), transparent 100%)`));
    expect(bg).toContain('at 50% 100%');
  });

  it('fullUpDeep: a darker shade of the same color at the bottom, the module color in the middle, then nothing', () => {
    const deep = `color-mix(in srgb, ${color} 70%, black)`;
    expect(bgOf('fullUpDeep')).toBe(
      asBackground(`linear-gradient(0deg, color-mix(in srgb, ${deep} 45%, transparent), color-mix(in srgb, ${color} 20%, transparent) 55%, transparent)`),
    );
  });

  it('all of them fill the height of the bar (active or not) and leave the inactive tabs and the logo plain', () => {
    for (const h of upTabs) {
      document.body.innerHTML = '';
      const t = tabs(h);
      for (const el of [t.active, t.inactive, t.dashboard]) {
        expect(el.className, h).toContain('self-stretch');
        expect(el.className, h).not.toMatch(/\bpy-/);
      }
      expect(t.inactive.style.background, h).toBe('');
      expect(t.active.querySelector('[data-logo]')!.getAttribute('data-tone'), h).toBe('solid');
    }
  });

  it('the four differ from each other and from Full up', () => {
    const all = upTabs.map(bgOf);
    expect(new Set(all).size).toBe(upTabs.length);
  });
});

// Five steps between Up soft (linear, light) and Up glow (radial at the bottom center, strong).
describe('steps between Up soft and Up glow', () => {
  const steps = ['upBlend', 'upGlowSoft', 'upGlowLine', 'upGlowTall', 'upGlowWide'] as const;
  const bgOf = paintOf;
  const mixed = (pct: number): string => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

  it('upBlend: a small radial glow over the light linear base of Up soft', () => {
    expect(bgOf('upBlend')).toBe(asBackgroundImage(`radial-gradient(60% 90% at 50% 100%, ${mixed(32)}, transparent 100%), linear-gradient(0deg, ${mixed(14)}, transparent)`));
  });

  it('upGlowSoft: the shape of Up glow at about half its intensity', () => {
    expect(bgOf('upGlowSoft')).toBe(asBackgroundImage(`radial-gradient(75% 100% at 50% 100%, ${mixed(28)}, transparent 100%)`));
  });

  it('upGlowLine: Glow soft plus a thin line along the bottom edge', () => {
    const t = tabs('upGlowLine');
    expect(t.active.style.backgroundImage).toBe(asBackgroundImage(`radial-gradient(75% 100% at 50% 100%, ${mixed(28)}, transparent 100%)`));
    expect(t.active.style.boxShadow).toContain('inset 0 -1px 0');
  });

  it('upGlowTall: the ellipse is taller than the tab (150%) so the glow reaches the top', () => {
    expect(bgOf('upGlowTall')).toBe(asBackgroundImage(`radial-gradient(75% 150% at 50% 100%, ${mixed(32)}, transparent 100%)`));
  });

  it('upGlowWide: the ellipse is wider than the tab (120%)', () => {
    expect(bgOf('upGlowWide')).toBe(asBackgroundImage(`radial-gradient(120% 100% at 50% 100%, ${mixed(32)}, transparent 100%)`));
  });

  it('all of them are anchored at the bottom center, like Up glow, and fill the bar height', () => {
    for (const h of steps) {
      document.body.innerHTML = '';
      const t = tabs(h);
      expect(t.active.style.backgroundImage, h).toContain('at 50% 100%');
      for (const el of [t.active, t.inactive, t.dashboard]) expect(el.className, h).toContain('self-stretch');
      expect(t.inactive.style.backgroundImage, h).toBe('');
    }
  });

  it('the intensity grows from Up soft (14%) through Glow soft (28%) to Up glow (50%)', () => {
    // The CSS serializer drops a 50% mix (the default of color-mix): no percentage means 50.
    const percent = (css: string): number => {
      const mixes = Array.from(css.matchAll(/color-mix\(in srgb, (?:rgb\([^)]*\)|#[0-9a-f]+)(?: (\d+)%)?, transparent\)/gi), (m) => (m[1] ? Number(m[1]) : 50));
      expect(mixes.length, css).toBeGreaterThan(0);
      return Math.max(...mixes);
    };
    const soft = percent(bgOf('fullUpSoft'));
    const glowSoft = percent(bgOf('upGlowSoft'));
    const glow = percent(bgOf('fullUpGlow'));
    expect(soft).toBeLessThan(glowSoft);
    expect(glowSoft).toBeLessThan(glow);
  });

  it('the five are all different from each other and from Up soft and Up glow', () => {
    // Paint and shadow together: upGlowLine only differs from upGlowSoft by its bottom line.
    const snapshot = (h: TabHighlight): string => {
      document.body.innerHTML = '';
      const style = tabs(h).active.style;
      return `${style.background || style.backgroundImage}|${style.boxShadow}`;
    };
    const all = [...steps, 'fullUpSoft', 'fullUpGlow'].map((h) => snapshot(h as TabHighlight));
    expect(new Set(all).size).toBe(all.length);
  });
});
