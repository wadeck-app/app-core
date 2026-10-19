import { useCallback, useEffect, useState } from 'react';

const HIDDEN_KEY = 'app-core.dashboard.hidden';
const ORDER_KEY = 'app-core.dashboard.order';

function readKeys(storageKey: string, consequence: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw === null ? [] : (JSON.parse(raw) as string[]);
  } catch (err) {
    // A broken value or a blocked storage must not break the dashboard, but the user has to know why the choice is gone.
    console.warn(`[dashboard] cannot read "${storageKey}" from localStorage: ${String(err)}. ${consequence}`);
    return [];
  }
}

// A list of widget keys kept in this browser (localStorage) so a choice survives a reload.
function useStoredKeys(storageKey: string, readConsequence: string, writeConsequence: string): [string[], (next: string[]) => void] {
  const [keys, setKeys] = useState<string[]>(() => readKeys(storageKey, readConsequence));
  const write = useCallback(
    (next: string[]) => {
      setKeys(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch (err) {
        console.warn(`[dashboard] cannot save "${storageKey}" to localStorage: ${String(err)}. ${writeConsequence}`);
      }
    },
    [storageKey, writeConsequence],
  );
  return [keys, write];
}

// The widgets the user hid.
export function useHiddenWidgets(): { hidden: ReadonlySet<string>; hide: (key: string) => void; restoreAll: () => void } {
  const [keys, write] = useStoredKeys(HIDDEN_KEY, 'Showing every widget.', 'They come back after a reload.');
  const hide = useCallback((key: string) => write(keys.includes(key) ? keys : [...keys, key]), [keys, write]);
  const restoreAll = useCallback(() => write([]), [write]);
  return { hidden: new Set(keys), hide, restoreAll };
}

export interface WidgetOrder<T extends { key: string }> {
  // Every widget, in the order the user chose (new widgets, unknown to the saved order, come last in their natural order).
  ordered: T[];
  // Whether the user changed the natural order.
  customized: boolean;
  // Puts `key` where `targetKey` is.
  moveTo: (key: string, targetKey: string) => void;
  // Swaps `key` with its neighbour among `among` (the widgets currently shown), one step earlier (-1) or later (+1).
  step: (key: string, delta: -1 | 1, among: readonly string[]) => void;
  reset: () => void;
}

// The order of the dashboard widgets, chosen by dragging or with the widget menu.
export function useWidgetOrder<T extends { key: string }>(widgets: readonly T[]): WidgetOrder<T> {
  const [saved, write] = useStoredKeys(ORDER_KEY, 'Using the default order.', 'The order comes back to the default after a reload.');
  const rank = (key: string): number => {
    const at = saved.indexOf(key);
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };
  // Array.sort is stable, so widgets without a saved rank keep their natural order.
  const ordered = [...widgets].sort((a, b) => rank(a.key) - rank(b.key));
  const keys = ordered.map((w) => w.key);

  const moveTo = (key: string, targetKey: string): void => {
    const from = keys.indexOf(key);
    const to = keys.indexOf(targetKey);
    if (from === -1 || to === -1 || from === to) {
      return;
    }
    const next = keys.filter((k) => k !== key);
    next.splice(to, 0, key);
    write(next);
  };

  const step = (key: string, delta: -1 | 1, among: readonly string[]): void => {
    const neighbour = among[among.indexOf(key) + delta];
    if (neighbour !== undefined) {
      moveTo(key, neighbour);
    }
  };

  const customized = saved.length > 0;
  return { ordered, customized, moveTo, step, reset: () => write([]) };
}

export type RefreshInterval = 'off' | '30s' | '1m' | '5m';
const INTERVAL_MS: Record<Exclude<RefreshInterval, 'off'>, number> = { '30s': 30_000, '1m': 60_000, '5m': 300_000 };

// A counter that goes up on `refresh()` and, when an interval is chosen, by itself; widgets re-run when it changes.
export function useRefreshTick(interval: RefreshInterval): { tick: number; refresh: () => void } {
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    if (interval === 'off') {
      return undefined;
    }
    const timer = window.setInterval(refresh, INTERVAL_MS[interval]);
    return () => window.clearInterval(timer);
  }, [interval, refresh]);
  return { tick, refresh };
}
