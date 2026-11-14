import { useCallback, useState } from 'react';

const STORAGE_KEY = 'app-core.nav.tab-order';

// The items in the order the user chose; items the saved order does not know (a module registered since) come last, in
// their default order, and ids it knows that no longer exist are ignored.
export function applyTabOrder<T extends { id: string }>(items: readonly T[], saved: readonly string[]): T[] {
  const rank = (id: string): number => {
    const at = saved.indexOf(id);
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };
  // Array.sort is stable: the items without a saved rank keep their default order.
  return [...items].sort((a, b) => rank(a.id) - rank(b.id));
}

// Moves `id` one place earlier (-1) or later (+1) in `ids`; unchanged at either end.
export function moveId(ids: readonly string[], id: string, delta: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= ids.length) {
    return [...ids];
  }
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? [] : (JSON.parse(raw) as string[]);
  } catch (err) {
    console.warn(`[nav] cannot read "${STORAGE_KEY}" from localStorage: ${String(err)}. The tabs use the default order.`);
    return [];
  }
}

// The order of the module tabs the user set (empty: the default order, the one the modules were registered in). It is kept
// in this browser (localStorage): app-core has no user account yet to keep it with.
export function useTabOrder(): { saved: string[]; save: (ids: string[]) => void; reset: () => void } {
  const [saved, setSaved] = useState<string[]>(read);
  const save = useCallback((ids: string[]) => {
    setSaved(ids);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch (err) {
      console.warn(`[nav] cannot save "${STORAGE_KEY}" to localStorage: ${String(err)}. The order comes back to the default after a reload.`);
    }
  }, []);
  const reset = useCallback(() => save([]), [save]);
  return { saved, save, reset };
}

const HIDDEN_STORAGE_KEY = 'app-core.nav.hidden-modules';

function readHidden(): string[] {
  try {
    const raw = window.localStorage.getItem(HIDDEN_STORAGE_KEY);
    return raw === null ? [] : (JSON.parse(raw) as string[]);
  } catch (err) {
    console.warn(`[nav] cannot read "${HIDDEN_STORAGE_KEY}" from localStorage: ${String(err)}. Every module is shown.`);
    return [];
  }
}

// `id` added to the hidden ones, or removed from them when it was there.
export function toggleHidden(hidden: readonly string[], id: string): string[] {
  return hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
}

// The modules the user hid from the top bar and the dashboard menu (their pages stay reachable by address). Kept in this browser,
// like the order.
export function useHiddenModules(): { hidden: string[]; toggle: (id: string) => void; reset: () => void } {
  const [hidden, setHidden] = useState<string[]>(readHidden);
  const store = useCallback((next: string[]) => {
    setHidden(next);
    try {
      window.localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify(next));
    } catch (err) {
      console.warn(`[nav] cannot save "${HIDDEN_STORAGE_KEY}" to localStorage: ${String(err)}. The hidden modules come back after a reload.`);
    }
  }, []);
  const toggle = useCallback((id: string) => store(toggleHidden(hidden, id)), [store, hidden]);
  const reset = useCallback(() => store([]), [store]);
  return { hidden, toggle, reset };
}
