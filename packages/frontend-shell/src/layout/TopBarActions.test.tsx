import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DateFormatProvider } from '../dates/DateFormatContext.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { TopBarActions } from './TopBarActions.js';

describe('TopBarActions theme toggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  const renderBar = () =>
    render(
      <MemoryRouter>
        <DateFormatProvider>
          <TopBarActions modules={[]} />
        </DateFormatProvider>
      </MemoryRouter>,
    );

  it('switches to dark: adds the dark class on <html> and persists the choice', () => {
    renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument();
  });

  it('switches back to light and removes the dark class', () => {
    localStorage.setItem('theme', 'dark');
    document.documentElement.classList.add('dark');
    renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('starts from the stored preference', () => {
    localStorage.setItem('theme', 'dark');
    renderBar();
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument();
  });
});
