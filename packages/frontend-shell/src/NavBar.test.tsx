import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
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
