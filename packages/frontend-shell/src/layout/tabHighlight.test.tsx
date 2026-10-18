import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { fakeNavModules } from './LayoutLab.js';
import { ModuleTabs } from './ModuleTabs.js';
import { TAB_HIGHLIGHTS, type TabHighlight } from './tabHighlight.js';

const navModules = fakeNavModules('d7');
const billing = navModules[0];

const tabs = (highlight: TabHighlight, logos = true) => {
  render(
    <MemoryRouter initialEntries={[billing.basePath]}>
      <ModuleTabs navModules={navModules} logos={logos} highlight={highlight} />
    </MemoryRouter>,
  );
  const nav = within(screen.getByRole('navigation', { name: 'Modules' }));
  return {
    active: nav.getByRole('link', { name: 'Billing' }),
    inactive: nav.getByRole('link', { name: 'Inventory' }),
    logo: (link: HTMLElement) => link.querySelector<HTMLElement>('[data-logo]')!,
  };
};

describe('ModuleTabs highlight', () => {
  it('current keeps the original emphasis: colored text, same logo size and tone for every tab', () => {
    const t = tabs('current');
    expect(t.active.className).toContain('text-primary');
    expect(t.logo(t.active).getAttribute('data-tone')).toBe('solid');
    expect(t.logo(t.inactive).getAttribute('data-tone')).toBe('solid');
    expect(t.logo(t.active).className).toBe(t.logo(t.inactive).className);
  });

  it.each(['pill', 'solid', 'underline', 'ring'] as const)('%s: only the active module keeps a full-color logo, the others are greyed out', (highlight) => {
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
    expect(t.active.className).toContain('border-primary-solid');
    expect(t.inactive.className).toContain('border-transparent');
  });

  it('ring: a larger logo with a ring on the active module only', () => {
    const t = tabs('ring');
    expect(t.logo(t.active).className).toContain('ring-2');
    expect(t.logo(t.inactive).className).not.toContain('ring-2');
    expect(t.logo(t.active).className).toContain('h-6');
    expect(t.logo(t.inactive).className).toContain('h-5');
  });

  it('shows no logo when logos are off, whatever the highlight', () => {
    const t = tabs('ring', false);
    expect(t.active.querySelector('[data-logo]')).toBeNull();
  });

  it('invert: the active icon swaps foreground and background (page-colored chip, module-colored letters and border), the others stay filled', () => {
    const t = tabs('invert');
    const a = t.logo(t.active);
    expect(a.getAttribute('data-tone')).toBe('swapped');
    expect(a.style.backgroundColor).toBe('var(--color-surface)');
    expect(a.style.color).not.toBe('');
    expect(a.style.boxShadow).toContain('inset');
    expect(t.logo(t.inactive).getAttribute('data-tone')).toBe('solid');
    expect(t.logo(t.inactive).style.backgroundColor).not.toBe('var(--color-surface)');
  });

  it('outline: inactive icons are outlined (transparent, colored letters), the active one is filled', () => {
    const t = tabs('outline');
    const i = t.logo(t.inactive);
    expect(i.getAttribute('data-tone')).toBe('outline');
    expect(i.style.backgroundColor).toBe('transparent');
    expect(i.style.color).not.toBe('');
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
    const hidden = t.inactive.querySelector('span.sr-only');
    expect(hidden).toHaveTextContent('Inventory');
    expect(t.inactive).toHaveAttribute('title', 'Inventory');
    expect(t.active.querySelector('span.sr-only')).toBeNull();
    expect(t.active).not.toHaveAttribute('title');
    expect(t.inactive.querySelector('[data-logo]')).not.toBeNull();
  });

  it('expand without logos folds nothing: there would be no icon left to click', () => {
    const t = tabs('expand', false);
    expect(t.inactive.querySelector('span.sr-only')).toBeNull();
  });

  it('lift: the active tab sits on a neutral raised card', () => {
    const t = tabs('lift');
    expect(t.active.className).toContain('bg-bg');
    expect(t.active.className).toContain('shadow-sm');
    expect(t.inactive.className).not.toContain('shadow-sm');
  });

  it('lists the ten styles offered by the switcher', () => {
    expect(Object.keys(TAB_HIGHLIGHTS)).toEqual(['current', 'pill', 'solid', 'underline', 'ring', 'invert', 'outline', 'glow', 'expand', 'lift']);
  });
});
