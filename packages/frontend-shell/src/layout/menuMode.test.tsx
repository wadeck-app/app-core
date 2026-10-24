import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuFrame } from './MenuFrame.js';
import { MenuToggle } from './MenuToggle.js';
import { menuClasses, useMenuState, type MenuMode, type MenuState } from './menuMode.js';

const STORAGE_KEY = 'app-core.nav.menu-collapsed';

// A matchMedia whose answer the test controls, and that tells its listeners when it changes (a resized window).
function mockMedia(initialNarrow: boolean): { setNarrow: (narrow: boolean) => void } {
  let narrow = initialNarrow;
  const listeners = new Set<() => void>();
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      get matches() {
        return narrow;
      },
      media: query,
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    }),
  });
  return {
    setNarrow: (value) => {
      narrow = value;
      listeners.forEach((cb) => cb());
    },
  };
}

function Harness({ mode, pathname }: { mode: MenuMode; pathname: string }) {
  const state = useMenuState(pathname);
  return (
    <MenuFrame mode={mode} state={state}>
      <MenuToggle state={state} label="menu" />
      <span data-testid="state">{JSON.stringify({ narrow: state.narrow, collapsed: state.collapsed, drawerOpen: state.drawerOpen, visible: state.visible })}</span>
    </MenuFrame>
  );
}

const stateOf = (): MenuState => JSON.parse(screen.getByTestId('state').textContent ?? '{}') as MenuState;
const frame = (container: HTMLElement): HTMLElement => container.firstElementChild as HTMLElement;

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('menuClasses', () => {
  const state = (over: Partial<MenuState>): MenuState => ({ narrow: false, collapsed: false, drawerOpen: false, visible: true, toggle: () => {}, closeDrawer: () => {}, ...over });

  it('adds nothing in fixed mode, whatever the state', () => {
    expect(menuClasses('fixed', state({ collapsed: true, drawerOpen: true }))).toBe('');
  });

  it('hides the menu below md until the drawer opens, in both modes', () => {
    for (const mode of ['collapsible', 'rail'] as const) {
      expect(menuClasses(mode, state({}))).toContain('max-md:[&_[data-testid=shell-menu]]:hidden');
      const open = menuClasses(mode, state({ drawerOpen: true }));
      expect(open).toContain('max-md:[&_[data-testid=shell-menu]]:fixed');
      expect(open).not.toContain('max-md:[&_[data-testid=shell-menu]]:hidden');
    }
  });

  it('hides the menu on a wide screen when collapsed (collapsible) and shrinks it to a rail (rail)', () => {
    expect(menuClasses('collapsible', state({ collapsed: true }))).toContain('md:[&_[data-testid=shell-menu]]:hidden');
    const rail = menuClasses('rail', state({ collapsed: true }));
    expect(rail).toContain('md:[&_[data-testid=shell-menu]]:w-14');
    expect(rail.split(' ')).not.toContain('md:[&_[data-testid=shell-menu]]:hidden');
  });

  it('does not leak one call into the next (the class lists are shared constants)', () => {
    menuClasses('rail', state({ collapsed: true }));
    expect(menuClasses('rail', state({ collapsed: false }))).not.toContain('w-14');
  });
});

describe('useMenuState on a wide screen', () => {
  it('starts open, and the button collapses it and keeps that in this browser', () => {
    mockMedia(false);
    render(<Harness mode="collapsible" pathname="/a" />);
    expect(stateOf()).toMatchObject({ narrow: false, collapsed: false, visible: true });
    fireEvent.click(screen.getByRole('button', { name: 'Hide menu' }));
    expect(stateOf()).toMatchObject({ collapsed: true, visible: false });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true');
    expect(screen.getByRole('button', { name: 'Show menu' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('starts collapsed when the user left it so', () => {
    mockMedia(false);
    window.localStorage.setItem(STORAGE_KEY, 'true');
    render(<Harness mode="rail" pathname="/a" />);
    expect(stateOf()).toMatchObject({ collapsed: true, visible: false });
  });

  it('says so when the preference cannot be read, and starts open', () => {
    mockMedia(false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    render(<Harness mode="rail" pathname="/a" />);
    expect(stateOf().collapsed).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('cannot read "app-core.nav.menu-collapsed"'));
  });
});

describe('useMenuState on a narrow screen', () => {
  it('opens a drawer with a backdrop, and does not touch the saved preference', () => {
    mockMedia(true);
    const { container } = render(<Harness mode="collapsible" pathname="/a" />);
    expect(stateOf()).toMatchObject({ narrow: true, drawerOpen: false, visible: false });
    expect(screen.queryByTestId('menu-backdrop')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show menu' }));
    expect(stateOf()).toMatchObject({ drawerOpen: true, visible: true });
    expect(screen.getByTestId('menu-backdrop')).toBeInTheDocument();
    expect(frame(container).className).toContain('max-md:[&_[data-testid=shell-menu]]:fixed');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('closes on the backdrop, on Escape and on a page change', () => {
    mockMedia(true);
    const { rerender } = render(<Harness mode="collapsible" pathname="/a" />);
    const open = (): void => fireEvent.click(screen.getByRole('button', { name: 'Show menu' }));

    open();
    fireEvent.click(screen.getByTestId('menu-backdrop'));
    expect(stateOf().drawerOpen).toBe(false);

    open();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(stateOf().drawerOpen).toBe(false);

    open();
    rerender(<Harness mode="collapsible" pathname="/b" />);
    expect(stateOf().drawerOpen).toBe(false);
  });

  it('follows the window being resized, and closes a drawer left open when it becomes wide', () => {
    const media = mockMedia(true);
    render(<Harness mode="rail" pathname="/a" />);
    fireEvent.click(screen.getByRole('button', { name: 'Show menu' }));
    expect(stateOf().drawerOpen).toBe(true);
    act(() => media.setNarrow(false));
    expect(stateOf()).toMatchObject({ narrow: false, drawerOpen: false, visible: true });
  });

  it('has no backdrop in fixed mode', () => {
    mockMedia(true);
    render(<Harness mode="fixed" pathname="/a" />);
    expect(screen.queryByTestId('menu-backdrop')).toBeNull();
  });
});
