import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.js';

vi.mock('./useModules.js', () => ({
  useModules: () => ({
    error: undefined,
    data: {
      modules: [],
      failed: [
        { id: 'ghost', source: '/x/manifest.json', error: 'ENOENT: no such file', failedAt: '2026-10-17T10:00:00.000Z' },
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
});
