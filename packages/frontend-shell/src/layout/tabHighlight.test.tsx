import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { moduleColor, moduleColor2 } from './Logo.js';
import { ModuleTabs } from './ModuleTabs.js';
import { TAB_HIGHLIGHT_HINTS, TAB_HIGHLIGHTS, type TabHighlight } from './tabHighlight.js';
import { FIXTURE_NAV } from './testFixtures.js';

const billing = FIXTURE_NAV[0];

const tabs = (highlight: TabHighlight) => {
  render(
    <MemoryRouter initialEntries={[billing.basePath]}>
      <ModuleTabs navModules={FIXTURE_NAV} highlight={highlight} />
    </MemoryRouter>,
  );
  const nav = within(screen.getByRole('navigation', { name: 'Modules' }));
  const link = (name: string) => nav.getByRole('link', { name });
  return {
    active: link('Billing'),
    inactive: link('Inventory'),
    dashboard: link('Dashboard'),
    logo: (l: HTMLElement) => l.querySelector<HTMLElement>('[data-logo]')!,
  };
};

describe('tab highlight options', () => {
  it('offers forty-one styles, each with a tooltip', () => {
    const ids = Object.keys(TAB_HIGHLIGHTS);
    expect(ids).toEqual([
      'current', 'pill', 'solid', 'underline', 'ring', 'invert', 'outline', 'glow', 'expand', 'lift',
      'contrast', 'chip', 'ghost', 'gradient', 'topline', 'dot',
      'gradientSoft', 'gradientFull', 'gradientEdges',
      'gradientEdgesInv', 'gradientFullDown', 'gradientFullUp', 'fullUpStrong', 'fullUpSoft', 'upBlend', 'upGlowSoft', 'upGlowLine', 'upGlowTall', 'upGlowWide', 'fullUpGlow', 'fullUpDeep',
      'gradientFullEdges', 'gradientUnder', 'innerGlow',
      'sweep', 'sweepSoft', 'aurora', 'underglow', 'spotlight', 'mesh', 'aura',
    ]);
    for (const id of ids) expect(TAB_HIGHLIGHT_HINTS[id as TabHighlight].length, id).toBeGreaterThan(30);
  });

  it('no tooltip claims that the logo grows', () => {
    for (const [id, hint] of Object.entries(TAB_HIGHLIGHT_HINTS)) expect(hint, id).not.toMatch(/grow|larger/i);
  });
});

describe('icon size', () => {
  // The module logo has one size in the top bar: emphasis must never resize it, whatever the style or the state.
  it.each(Object.keys(TAB_HIGHLIGHTS) as TabHighlight[])('%s: the active logo has the same size as the inactive ones', (highlight) => {
    const t = tabs(highlight);
    const sizeClasses = (el: HTMLElement) => el.className.split(/\s+/).filter((c) => /^(h-|min-w-|px-|text-\[)/.test(c)).sort();
    expect(sizeClasses(t.logo(t.active))).toEqual(sizeClasses(t.logo(t.inactive)));
    expect(t.logo(t.active).className).toContain('h-5');
  });
});

describe('ModuleTabs highlight', () => {
  it('current: colored text, same logo size and tone for every tab', () => {
    const t = tabs('current');
    expect(t.active.className).toContain('text-primary');
    expect(t.logo(t.active).getAttribute('data-tone')).toBe('solid');
    expect(t.logo(t.inactive).getAttribute('data-tone')).toBe('solid');
    expect(t.logo(t.active).className).toBe(t.logo(t.inactive).className);
  });

  it.each(['pill', 'solid', 'underline', 'ring', 'topline', 'dot'] as const)('%s: only the active module keeps a full-color logo, the others are greyed out', (highlight) => {
    const t = tabs(highlight);
    expect(t.logo(t.active).getAttribute('data-tone')).not.toBe('muted');
    expect(t.logo(t.inactive).getAttribute('data-tone')).toBe('muted');
  });

  it('pill: tinted background behind the active tab only', () => {
    const t = tabs('pill');
    expect(t.active.className).toContain('bg-primary-light');
    expect(t.inactive.className).not.toContain('bg-primary-light');
  });

  it('solid: filled pill with white text, and an inverted logo (white chip, module color on the letters)', () => {
    const t = tabs('solid');
    expect(t.active.className).toContain('bg-primary-solid');
    expect(t.active.className).toContain('text-white');
    expect(t.logo(t.active).getAttribute('data-tone')).toBe('inverted');
    expect(t.logo(t.active).style.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(t.logo(t.active).style.color).not.toBe('');
  });

  it('underline: a bar under the active tab only', () => {
    const t = tabs('underline');
    expect(t.active.className).toContain('border-b-2');
    expect(t.active.className).toContain('border-primary-solid');
    expect(t.inactive.className).toContain('border-transparent');
  });

  it('ring: a ring on the active logo only, which keeps its size', () => {
    const t = tabs('ring');
    expect(t.logo(t.active).className).toContain('ring-2');
    expect(t.logo(t.inactive).className).not.toContain('ring-2');
  });

  it('invert: the active icon swaps foreground and background, the others stay filled', () => {
    const t = tabs('invert');
    const a = t.logo(t.active);
    expect(a.getAttribute('data-tone')).toBe('swapped');
    expect(a.style.backgroundColor).toBe('var(--color-surface)');
    expect(a.style.color).not.toBe('');
    expect(a.style.boxShadow).toContain('inset');
    expect(t.logo(t.inactive).getAttribute('data-tone')).toBe('solid');
  });

  it('outline: inactive icons are outlined, the active one is filled', () => {
    const t = tabs('outline');
    const i = t.logo(t.inactive);
    expect(i.getAttribute('data-tone')).toBe('outline');
    expect(i.style.backgroundColor).toBe('transparent');
    expect(t.logo(t.active).getAttribute('data-tone')).toBe('solid');
    expect(t.logo(t.active).style.backgroundColor).not.toBe('transparent');
  });

  it('glow: a halo around the active icon only', () => {
    const t = tabs('glow');
    expect(t.logo(t.active).style.boxShadow).toContain('0 0 0 4px');
    expect(t.logo(t.inactive).style.boxShadow).toBe('');
  });

  it('expand: inactive tabs fold to their icon (name kept for screen readers and as a tooltip), the active one shows its name', () => {
    const t = tabs('expand');
    expect(t.inactive.querySelector('span.sr-only')).toHaveTextContent('Inventory');
    expect(t.inactive).toHaveAttribute('title', 'Inventory');
    expect(t.inactive.querySelector('[data-logo]')).not.toBeNull();
    expect(t.active.querySelector('span.sr-only')).toBeNull();
    expect(t.active).not.toHaveAttribute('title');
    // The Dashboard has no icon to fold to.
    expect(t.dashboard.querySelector('span.sr-only')).toBeNull();
  });

  it('lift: the active tab sits on a neutral raised card', () => {
    const t = tabs('lift');
    expect(t.active.className).toContain('bg-bg');
    expect(t.active.className).toContain('shadow-sm');
    expect(t.inactive.className).not.toContain('shadow-sm');
  });

  it('contrast: the whole active tab swaps foreground and background in neutral colors', () => {
    const t = tabs('contrast');
    expect(t.active.className).toContain('bg-content');
    expect(t.active.className).toContain('text-surface');
    expect(t.inactive.className).not.toContain('bg-content');
    // The logo keeps the module color.
    expect(t.logo(t.active).getAttribute('data-tone')).toBe('solid');
  });

  it('chip: the active tab is filled with the module color, with a translucent logo', () => {
    const t = tabs('chip');
    expect(t.active.style.backgroundColor).not.toBe('');
    expect(t.active.className).toContain('text-white');
    expect(t.logo(t.active).getAttribute('data-tone')).toBe('glass');
    expect(t.inactive.style.backgroundColor).toBe('');
    // The fill is the module's own color: let the browser normalize the hex to the rgb() form it reports back.
    const expected = document.createElement('i');
    expected.style.backgroundColor = moduleColor('billing');
    expect(t.active.style.backgroundColor).toBe(expected.style.backgroundColor);
  });

  it('ghost: an outlined pill in the module color, no fill', () => {
    const t = tabs('ghost');
    expect(t.active.className).toContain('border-2');
    expect(t.active.style.borderColor).not.toBe('');
    expect(t.active.style.color).not.toBe('');
    expect(t.active.style.backgroundColor).toBe('');
    expect(t.inactive.className).toContain('border-transparent');
  });

  it('gradient: a gradient from the module color with a solid bar on the left edge', () => {
    const t = tabs('gradient');
    expect(t.active.style.background).toContain('linear-gradient');
    expect(t.active.style.boxShadow).toContain('inset 3px 0 0');
    expect(t.inactive.style.background).toBe('');
  });

  it('topline: a bar above the active tab', () => {
    const t = tabs('topline');
    expect(t.active.className).toContain('border-t-2');
    expect(t.active.className).toContain('border-primary-solid');
    expect(t.inactive.className).toContain('border-transparent');
  });

  describe('gradient styles', () => {
    it('sweep: a glossy highlight over a diagonal gradient from the module color, translucent logo', () => {
      const t = tabs('sweep');
      expect(t.active.style.backgroundImage).toContain('linear-gradient(115deg');
      expect(t.active.style.backgroundImage).toContain('linear-gradient(135deg');
      expect(t.active.className).toContain('text-white');
      expect(t.logo(t.active).getAttribute('data-tone')).toBe('glass');
      expect(t.inactive.style.backgroundImage).toBe('');
    });

    it('aurora: a gradient border (fill clipped to the padding box) and a two-tone logo', () => {
      const t = tabs('aurora');
      expect(t.active.style.backgroundImage).toContain('linear-gradient(90deg');
      expect(t.active.style.backgroundClip).toBe('padding-box, border-box');
      expect(t.active.style.backgroundOrigin).toBe('border-box');
      expect(t.active.className).toContain('border-transparent');
      expect(t.logo(t.active).getAttribute('data-tone')).toBe('duotone');
      expect(t.inactive.style.backgroundImage).toBe('');
    });

    it('underglow: a gradient bar with a glow, under the active tab only', () => {
      const t = tabs('underglow');
      const bar = t.active.querySelector<HTMLElement>('[data-decoration="underglow"]')!;
      expect(bar.style.backgroundImage).toContain('linear-gradient(90deg');
      expect(bar.style.boxShadow).not.toBe('');
      expect(t.inactive.querySelector('[data-decoration="underglow"]')).toBeNull();
    });

    it('spotlight: a radial light cone from the top edge of the active tab', () => {
      const t = tabs('spotlight');
      expect(t.active.style.backgroundImage).toContain('radial-gradient(90% 140% at 50% 0%');
      expect(t.inactive.style.backgroundImage).toBe('');
    });

    it('mesh: two radial blobs on the surface, with a two-tone logo', () => {
      const t = tabs('mesh');
      const bg = t.active.style.backgroundImage;
      expect(bg.match(/radial-gradient/g)).toHaveLength(2);
      expect(t.active.style.backgroundColor).toBe('var(--color-surface)');
      expect(t.logo(t.active).getAttribute('data-tone')).toBe('duotone');
    });

    it('aura: the active name (not the tab) is painted with the gradient', () => {
      const t = tabs('aura');
      const name = Array.from(t.active.querySelectorAll('span')).find((s) => s.textContent === 'Billing')!;
      expect(name.style.backgroundImage).toContain('linear-gradient(90deg');
      expect(name.style.backgroundClip).toBe('text');
      expect(name.style.color).toBe('transparent');
      expect(t.active.style.backgroundImage).toBe('');
      expect(t.logo(t.active).getAttribute('data-tone')).toBe('duotone');
    });

    it('the second hue always differs from the module color, so a two-tone gradient is never flat', () => {
      for (const id of [...FIXTURE_NAV.map((m) => m.id), 'queue', 'orchestrator', 'task']) {
        expect(moduleColor2(id), id).not.toBe(moduleColor(id));
        expect(moduleColor2(id), id).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });
  });

  it('dot: a small dot under the active tab only', () => {
    const t = tabs('dot');
    expect(t.active.querySelector('span.rounded-full[aria-hidden="true"]')).not.toBeNull();
    expect(t.inactive.querySelector('span.rounded-full[aria-hidden="true"]')).toBeNull();
  });
});
