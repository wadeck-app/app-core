import { useCallback, useEffect, useState } from 'react';

// What the side menu does when there is not enough room, or when the user wants the room back.
//   fixed        always visible, 15rem (what AppShell does alone; on a narrow screen it eats the page)
//   collapsible  a button in the top bar hides it; on a narrow screen it is hidden and opens as a drawer
//   rail         the button shrinks it to a strip of tiles (page initials, label as tooltip); drawer on a narrow screen
// AppShell has no such option (its menu is a fixed 15rem), so this wraps it and steers its `aside` from outside. Once a
// variant is decided it belongs inside AppShell (dsl-ui), not here.
export type MenuMode = 'fixed' | 'collapsible' | 'rail';

const STORAGE_KEY = 'app-core.nav.menu-collapsed';
// Tailwind's md breakpoint: below it the menu is a drawer.
const NARROW_QUERY = '(max-width: 767px)';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch (err) {
    console.warn(`[nav] cannot read "${STORAGE_KEY}" from localStorage: ${String(err)}. The menu starts open.`);
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(collapsed));
  } catch (err) {
    console.warn(`[nav] cannot save "${STORAGE_KEY}" to localStorage: ${String(err)}. The menu comes back open after a reload.`);
  }
}

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY);
    const onChange = (): void => setNarrow(query.matches);
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

export interface MenuState {
  narrow: boolean;
  /** Wide screen: the user hid (or shrank) the menu. Kept in this browser. */
  collapsed: boolean;
  /** Narrow screen: the drawer is open. Never kept: a page change or Escape closes it. */
  drawerOpen: boolean;
  /** Is the menu showing right now (full or rail does not matter)? */
  visible: boolean;
  toggle: () => void;
  closeDrawer: () => void;
}

// `pathname` closes the drawer when the page changes: it is covering the page the user just chose.
export function useMenuState(pathname: string): MenuState {
  const narrow = useNarrow();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname, narrow]);

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setDrawerOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const toggle = useCallback(() => {
    if (narrow) {
      setDrawerOpen((open) => !open);
      return;
    }
    setCollapsed((was) => {
      writeCollapsed(!was);
      return !was;
    });
  }, [narrow]);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return { narrow, collapsed, drawerOpen, visible: narrow ? drawerOpen : !collapsed, toggle, closeDrawer };
}

// The menu is AppShell's <aside data-testid="shell-menu">; these classes are set on a wrapper and reach it from there.
// Every class is written out in full: Tailwind finds classes by scanning the source for whole strings, and a class built
// by concatenation is never generated (the rail silently did nothing when it was).

// A drawer: over the page, under the top bar (h-11).
const DRAWER_OPEN = [
  'max-md:[&_[data-testid=shell-menu]]:fixed',
  'max-md:[&_[data-testid=shell-menu]]:left-0',
  'max-md:[&_[data-testid=shell-menu]]:top-11',
  'max-md:[&_[data-testid=shell-menu]]:bottom-0',
  'max-md:[&_[data-testid=shell-menu]]:z-30',
  'max-md:[&_[data-testid=shell-menu]]:shadow-lg',
];
const DRAWER_CLOSED = ['max-md:[&_[data-testid=shell-menu]]:hidden'];
const RAIL = [
  'md:[&_[data-testid=shell-menu]]:w-14',
  'md:[&_[data-testid=shell-menu]]:p-2',
  'md:[&_[data-testid=shell-menu]_span.truncate]:hidden',
  'md:[&_[data-testid=shell-menu]_a]:justify-center',
  'md:[&_[data-testid=shell-menu]_a]:px-0',
];
const HIDDEN = ['md:[&_[data-testid=shell-menu]]:hidden'];

export function menuClasses(mode: MenuMode, state: MenuState): string {
  if (mode === 'fixed') {
    return '';
  }
  const classes = [...(state.drawerOpen ? DRAWER_OPEN : DRAWER_CLOSED)];
  if (state.collapsed) {
    classes.push(...(mode === 'rail' ? RAIL : HIDDEN));
  }
  return classes.join(' ');
}
