import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppNavBar } from './NavBar.js';
import type { LoadedModuleSummary } from './types.js';

describe('AppNavBar (base slot: page/nav -> top-nav entry, frontend-shell.md)', () => {
  it('lists a page/nav extensionPoint as a nav link', () => {
    const modules: LoadedModuleSummary[] = [
      {
        id: 'module-b',
        version: '1.0.0',
        extensionPoints: [
          { kind: 'page', slot: 'nav', label: 'Fixture B Page', view: { $type: 'Badge', label: 'x' }, rawYaml: '$type: Badge\nlabel: x\n' },
        ],
      },
    ];
    render(
      <MemoryRouter>
        <AppNavBar modules={modules} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Fixture B Page' })).toHaveAttribute('href', '/modules/module-b/0');
  });

  it('does not list widget/dashboard extensionPoints as nav links', () => {
    const modules: LoadedModuleSummary[] = [
      { id: 'module-a', version: '1.0.0', extensionPoints: [{ kind: 'widget', slot: 'dashboard', view: { $type: 'Badge', label: 'x' }, rawYaml: '$type: Badge\nlabel: x\n' }] },
    ];
    render(
      <MemoryRouter>
        <AppNavBar modules={modules} />
      </MemoryRouter>,
    );
    expect(screen.queryAllByRole('link').length).toBe(1); // only the always-present "Dashboard" link
  });
});

describe('AppNavBar theme toggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  const renderBar = () =>
    render(
      <MemoryRouter>
        <AppNavBar modules={[]} />
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
