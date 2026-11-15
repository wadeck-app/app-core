import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DateSettingsProvider } from '../dates/DateFormatContext.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { TopBarActions } from './TopBarActions.js';

describe('TopBarActions theme control', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  const renderBar = () =>
    render(
      <MemoryRouter>
        <DateSettingsProvider>
          <TopBarActions modules={[]} />
        </DateSettingsProvider>
      </MemoryRouter>,
    );

  const chooseMode = (name: 'Light' | 'Dark') => {
    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Mode' })).getByRole('radio', { name }));
  };

  it('switches to dark: adds the dark class on <html> and persists the choice', () => {
    renderBar();
    chooseMode('Dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('switches back to light and removes the dark class', () => {
    localStorage.setItem('theme', 'dark');
    document.documentElement.classList.add('dark');
    renderBar();
    chooseMode('Light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('starts from the stored preference', () => {
    localStorage.setItem('theme', 'dark');
    renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));
    expect(within(screen.getByRole('radiogroup', { name: 'Mode' })).getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
  });
});
