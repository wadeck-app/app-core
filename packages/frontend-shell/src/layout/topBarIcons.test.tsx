import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DateSettingsProvider } from '../dates/DateFormatContext.js';
import { UpdateControl } from '../update/UpdateControl.js';
import { TopBarActions } from './TopBarActions.js';

const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const iconOf = (button: HTMLElement): string => (button.querySelector('svg')?.getAttribute('class') ?? '').split(/\s+/).find((name) => name.startsWith('lucide-')) ?? '';

const UPDATE_STATES = ['restart-needed', 'update-failed', 'applying', 'update-available', 'unknown'] as const;

describe('icons of the top bar', () => {
  let update: Record<string, unknown>;
  let elevated: boolean;

  beforeEach(() => {
    localStorage.clear();
    elevated = false;
    update = { state: 'unknown', reason: 'not run from an installed app-core-cli', running: null, installed: null, latest: null, canRestart: false };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/app-update') {
          return json(update);
        }
        if (url === '/api/auth/status') {
          return json({ pinSet: true, locked: false, elevated });
        }
        throw new Error(`unexpected ${url}`);
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const renderBar = () =>
    render(
      <MemoryRouter>
        <DateSettingsProvider>
          <TopBarActions modules={[]} />
        </DateSettingsProvider>
      </MemoryRouter>,
    );

  // Two controls with the same glyph cannot be told apart at a glance (the update control once used the Info "i" of the versions menu).
  const expectDistinctIcons = async (): Promise<void> => {
    renderBar();
    await screen.findByRole('button', { name: /app-core update/i });
    const icons = screen.getAllByRole('button').map(iconOf).filter((name) => name !== '');
    expect(icons.length).toBeGreaterThanOrEqual(5);
    expect(new Set(icons).size, `two controls of the top bar share an icon: ${icons.join(', ')}`).toBe(icons.length);
  };

  it('every control of the locked top bar has its own icon, with the update control in its unknown state', async () => {
    await expectDistinctIcons();
  });

  it('every control of the unlocked top bar (Sudo) has its own icon too', async () => {
    elevated = true;
    await expectDistinctIcons();
    await waitFor(() => expect(screen.getByText('Sudo')).toBeInTheDocument());
  });

  it('the update control in its unknown state is not the Info icon of the versions menu', async () => {
    renderBar();
    const update = await screen.findByRole('button', { name: /app-core update/i });
    expect(iconOf(update)).not.toBe('lucide-info');
    expect(iconOf(screen.getByRole('button', { name: 'Versions' }))).toBe('lucide-info');
  });

  it('each state of the update control has an icon of its own, none of them one of another top bar control', async () => {
    const seen = new Map<string, string>();
    for (const state of UPDATE_STATES) {
      update = { ...update, state, running: '1', installed: '2', latest: '2', canRestart: true };
      const { unmount } = render(<UpdateControl />);
      const trigger = await screen.findByRole('button', { name: /app-core update/i });
      seen.set(state, iconOf(trigger));
      unmount();
    }
    const icons = [...seen.values()];
    expect(new Set(icons).size, JSON.stringify([...seen])).toBe(UPDATE_STATES.length);
    for (const other of ['lucide-info', 'lucide-key-round', 'lucide-lock-keyhole', 'lucide-calendar-clock', 'lucide-sun', 'lucide-moon']) {
      expect(icons).not.toContain(other);
    }
  });
});
