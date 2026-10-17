import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.js';

vi.mock('./useModules.js', () => ({
  useModules: () => ({
    error: undefined,
    data: {
      modules: [{ id: 'steady', version: '1.0.0', extensionPoints: [] }],
      failed: [
        { id: 'ghost', source: '/x/manifest.json', error: 'ENOENT: no such file', failedAt: '2026-10-17T10:00:00.000Z' },
        { id: 'steady', source: '/y/manifest.json', error: 'bad yaml', failedAt: '2026-10-17T10:00:00.000Z' },
      ],
    },
  }),
}));

describe('App (modules that failed to load)', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('shows an alert naming each failed module and its reason', () => {
    render(<App />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('ghost')).toBeInTheDocument();
    expect(within(alert).getByText(/ENOENT: no such file/)).toBeInTheDocument();
    expect(within(alert).getByText(/failed to load/)).toBeInTheDocument();
  });

  it('says when the previous version of a module that failed to update is still running', () => {
    render(<App />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getAllByText(/The previous version is still running/)).toHaveLength(1);
    const steady = within(alert).getByText('steady').closest('li');
    expect(steady).toHaveTextContent('The previous version is still running.');
    const ghost = within(alert).getByText('ghost').closest('li');
    expect(ghost).not.toHaveTextContent('still running');
  });
});
