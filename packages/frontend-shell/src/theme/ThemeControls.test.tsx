import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { paletteStorageKey } from './palettes.js';
import { ThemeControls } from './ThemeControls.js';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  document.documentElement.removeAttribute('data-palette');
  document.documentElement.removeAttribute('data-palette-light');
});
afterEach(() => {
  document.documentElement.removeAttribute('data-palette');
  document.documentElement.removeAttribute('data-palette-light');
});

const mount = () =>
  render(
    <MemoryRouter>
      <ThemeControls />
    </MemoryRouter>,
  );

describe('ThemeControls', () => {
  it('is one button, whose popover holds the mode and the palettes of that mode', () => {
    mount();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));
    expect(within(screen.getByRole('radiogroup', { name: 'Mode' })).getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radiogroup', { name: 'Light palette' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Dark palette' })).toBeNull();
  });

  it('switches to dark: adds the dark class on <html>, persists the choice and lists the dark palettes', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Mode' })).getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(screen.getByRole('radiogroup', { name: 'Dark palette' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Light palette' })).toBeNull();
  });

  it('starts from the stored mode', () => {
    localStorage.setItem('theme', 'dark');
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));
    expect(within(screen.getByRole('radiogroup', { name: 'Mode' })).getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
  });

  it('applies the chosen dark palette at once, and keeps it per mode', () => {
    localStorage.setItem('theme', 'dark');
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));
    const group = screen.getByRole('radiogroup', { name: 'Dark palette' });
    expect(within(group).getByRole('radio', { name: /Default/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(group).getByRole('radio', { name: /Warm/ }));
    expect(document.documentElement.getAttribute('data-palette')).toBe('warm');
    expect(localStorage.getItem(paletteStorageKey('dark'))).toBe('warm');
    expect(within(screen.getByRole('radiogroup', { name: 'Dark palette' })).getByRole('radio', { name: /Warm/ })).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.hasAttribute('data-palette-light')).toBe(false);
  });

  it('applies the chosen light palette, and the dark one is left alone', () => {
    localStorage.setItem(paletteStorageKey('dark'), 'night');
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Light palette' })).getByRole('radio', { name: /Paper/ }));
    expect(document.documentElement.getAttribute('data-palette-light')).toBe('paper');
    expect(localStorage.getItem(paletteStorageKey('light'))).toBe('paper');
    expect(localStorage.getItem(paletteStorageKey('dark'))).toBe('night');
  });
});
