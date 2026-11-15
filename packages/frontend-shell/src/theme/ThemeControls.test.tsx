import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PALETTE_STORAGE_KEY } from './palettes.js';
import { ThemeControls } from './ThemeControls.js';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  document.documentElement.removeAttribute('data-palette');
});
afterEach(() => {
  document.documentElement.removeAttribute('data-palette');
});

const mount = () =>
  render(
    <MemoryRouter>
      <ThemeControls />
    </MemoryRouter>,
  );

describe('ThemeControls, "beside" (the reference)', () => {
  it('keeps the one-click dark/light button and adds a palette button next to it', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dark palette' })).toBeInTheDocument();
  });

  it('lists the palettes in the popover and applies the chosen one at once', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Dark palette' }));
    const group = screen.getByRole('radiogroup', { name: 'Dark palette' });
    expect(within(group).getByRole('radio', { name: /Default/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(group).getByRole('radio', { name: /Graphite/ }));
    expect(document.documentElement.getAttribute('data-palette')).toBe('graphite');
    expect(localStorage.getItem(PALETTE_STORAGE_KEY)).toBe('graphite');
    expect(within(screen.getByRole('radiogroup', { name: 'Dark palette' })).getByRole('radio', { name: /Graphite/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('says that a palette is for the dark mode while the light one is on', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Dark palette' }));
    expect(screen.getByText(/dark mode only/i)).toBeInTheDocument();
  });
});

describe('ThemeControls, "merged"', () => {
  beforeEach(() => {
    localStorage.setItem('ab.theme-control', 'merged');
  });

  it('has one button, whose popover holds the mode and the palettes', () => {
    mount();
    expect(screen.queryByRole('button', { name: 'Dark palette' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));
    const mode = screen.getByRole('radiogroup', { name: 'Mode' });
    expect(within(mode).getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(mode).getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Dark palette' })).getByRole('radio', { name: /Warm/ }));
    expect(document.documentElement.getAttribute('data-palette')).toBe('warm');
  });
});
