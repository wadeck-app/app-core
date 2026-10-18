import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { moduleColor } from './Logo.js';
import { ModuleTabs } from './ModuleTabs.js';
import { FIXTURE_NAV } from './testFixtures.js';

const billing = FIXTURE_NAV[0];
const color = moduleColor('billing');

// Expected values go through the same CSS serialization as the rendered ones, so the comparison is exact whatever
// normalization the environment applies; the sanity test fails loudly if the environment drops the value.
const asBackgroundImage = (css: string): string => {
  const probe = document.createElement('i');
  probe.style.backgroundImage = css;
  return probe.style.backgroundImage;
};

const mixed = (pct: number): string => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
const UP_BLEND = `radial-gradient(60% 90% at 50% 100%, ${mixed(32)}, transparent 100%), linear-gradient(0deg, ${mixed(14)}, transparent)`;

const tabs = (path = billing.basePath) => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <ModuleTabs navModules={FIXTURE_NAV} />
    </MemoryRouter>,
  );
  const navEl = screen.getByRole('navigation', { name: 'Modules' });
  const nav = within(navEl);
  return { navEl, nav, active: nav.getByRole('link', { name: 'Billing' }), inactive: nav.getByRole('link', { name: 'Inventory' }), dashboard: nav.getByRole('link', { name: 'Dashboard' }) };
};

describe('environment sanity', () => {
  it('keeps radial and linear color-mix gradients (otherwise the comparisons below would be vacuous)', () => {
    expect(asBackgroundImage(UP_BLEND)).toContain('radial-gradient');
    expect(asBackgroundImage(UP_BLEND)).toContain('linear-gradient');
  });
});

describe('ModuleTabs: the active tab is highlighted with Up blend', () => {
  it('paints a small radial glow at the bottom center over a light linear fade of the module color', () => {
    const t = tabs();
    expect(t.active.style.backgroundImage).toBe(asBackgroundImage(UP_BLEND));
  });

  it('leaves the inactive tabs plain', () => {
    const t = tabs();
    expect(t.inactive.style.backgroundImage).toBe('');
    expect(t.dashboard.style.backgroundImage).toBe('');
    expect(t.inactive.className).toContain('text-muted');
  });

  it('gives the active tab a bolder, darker name', () => {
    const t = tabs();
    expect(t.active.className).toContain('font-semibold');
    expect(t.active.className).toContain('text-content');
    expect(t.inactive.className).toContain('font-medium');
  });

  it('highlights the Dashboard tab the same way (with the app accent) when it is the current page', () => {
    const t = tabs('/');
    expect(t.dashboard.style.backgroundImage).toContain('radial-gradient(60% 90% at 50% 100%');
    expect(t.dashboard).toHaveAttribute('aria-current', 'page');
    expect(t.active.style.backgroundImage).toBe('');
  });

  it('highlights a tab on every page of its module', () => {
    const t = tabs(`${billing.basePath}/p2`);
    expect(t.active.style.backgroundImage).toBe(asBackgroundImage(UP_BLEND));
    expect(t.active).toHaveAttribute('aria-current', 'true');
  });

  it('uses each module\'s own color', () => {
    const first = tabs().active.style.backgroundImage;
    document.body.innerHTML = '';
    const other = tabs(FIXTURE_NAV[1].basePath).nav.getByRole('link', { name: 'Inventory' }).style.backgroundImage;
    expect(other).not.toBe(first);
    expect(other).not.toBe('');
  });
});

describe('ModuleTabs: shape', () => {
  it('every tab is as tall as the top bar, so the highlight fills it from top to bottom', () => {
    const t = tabs();
    for (const el of [t.active, t.inactive, t.dashboard]) {
      expect(el.className).toContain('self-stretch');
      expect(el.className).not.toMatch(/\bpy-/);
    }
    expect(t.navEl.className).toContain('self-stretch');
  });

  it('shows the same logo, at the same size, on every module tab', () => {
    const t = tabs();
    const logos = Array.from(t.navEl.querySelectorAll<HTMLElement>('[data-logo]'));
    expect(logos).toHaveLength(FIXTURE_NAV.length);
    const sizeClasses = (el: HTMLElement) => el.className.split(/\s+/).filter((c) => /^(h-|min-w-|px-|text-\[)/.test(c)).sort();
    for (const logo of logos) expect(sizeClasses(logo)).toEqual(sizeClasses(logos[0]));
    expect(logos[0].className).toContain('h-5');
  });

  it('has no logo on the Dashboard tab', () => {
    expect(tabs().dashboard.querySelector('[data-logo]')).toBeNull();
  });
});
