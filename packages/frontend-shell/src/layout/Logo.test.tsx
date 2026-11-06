import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo, moduleColor } from './Logo.js';

// The tile itself, initialsOf and colorFromId are dsl-ui's and tested there; these cover what is app-core's: the
// module palette and how a module becomes a logo.
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

  it('gives the real modules different colors', () => {
    const ids = ['queue', 'orchestrator', 'task', 'flow'];
    expect(new Set(ids.map(moduleColor)).size).toBe(ids.length);
  });

  it('spreads modules over several colors', () => {
    const ids = ['queue', 'orchestrator', 'billing', 'inventory', 'reports', 'audit-log', 'settings'];
    expect(new Set(ids.map(moduleColor)).size).toBeGreaterThan(3);
  });
});

describe('Logo', () => {
  it('is the initials of the title on the color of the module id, hidden from assistive technology', () => {
    const { container } = render(<Logo title="Billing" moduleId="billing" />);
    const logo = container.querySelector<HTMLElement>('[data-initials]')!;
    expect(logo.textContent).toBe('BI');
    expect(logo).toHaveAttribute('aria-hidden', 'true');
    expect(logo.style.backgroundColor).toBe(cssColor(moduleColor('billing')));
  });

  it('sits in a box of one width whatever the letters, so the labels next to logos line up', () => {
    const boxes = ['Q', 'Modules', 'Task'].map((title) => render(<Logo title={title} moduleId={title} />).container.querySelector('[data-logo-box]')!.className);
    expect(new Set(boxes).size).toBe(1);
    expect(boxes[0]).toContain('w-7');
  });

  it('keeps the color of the id when the title changes', () => {
    const a = render(<Logo title="Billing" moduleId="billing" />).container.querySelector<HTMLElement>('[data-initials]')!.style.backgroundColor;
    const b = render(<Logo title="Payments" moduleId="billing" />).container.querySelector<HTMLElement>('[data-initials]')!.style.backgroundColor;
    expect(b).toBe(a);
  });
});
